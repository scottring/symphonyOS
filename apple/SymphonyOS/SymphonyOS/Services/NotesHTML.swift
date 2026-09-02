import Foundation

/// Twin of `src/lib/notes/notesToHtml.ts` on the web, run in reverse.
///
/// Notes are stored as Tiptap HTML, but the web's `notesToHtml` treats
/// markdown-style plain text as an equally valid source: it lifts headings,
/// lists, quotes, rules and inline bold/italic/code into HTML on load, and is
/// idempotent on real HTML (a `BLOCK_TAG` passthrough check leaves it alone).
/// That means the phone never needs to render or re-encode HTML — it only
/// needs to show and edit the markdown-style text the web already accepts.
/// `NotesHTML.toMarkdown` is the inverse of `notesToHtml`: HTML in, the
/// equivalent markdown-style text out. Editing on the phone then writes that
/// markdown text straight back to `notes` — the web's own `notesToHtml`
/// upgrades it to HTML again next time it loads.
///
/// Lossy edges, deliberate:
///  - **Nested lists.** Tiptap's `ListItem` content is `paragraph block*` (and
///    `TaskItem` is `nested: true`), so an `<li>` can hold a nested
///    `<ul>`/`<ol>`/taskList or extra `<p>` siblings. `notesToHtml` has no
///    markdown syntax for that nesting, so a note edited on the phone and
///    reloaded on the web comes back as flat bullets/paragraphs instead of a
///    true sub-list. The content itself is never dropped — every child of
///    every `<li>` is rendered, indented two spaces per nesting level — this
///    is a real degrade in STRUCTURE, not in DATA.
///  - **Code blocks** (`<pre>`) render as a fenced ``` block. The web grammar
///    doesn't parse fences either, so they come back as a plain paragraph —
///    but the cue (and the content) survives.
///  - **Tables.** The web's Tiptap toolbar CAN produce real `<table>` notes
///    (this isn't a hypothetical), and `notesToHtml` has no table syntax at
///    all. Cells are joined with " | ", rows with newlines — readable, and
///    nothing is lost, but it round-trips through the web as plain text, not
///    a table.
enum NotesHTML {
    /// Same regex as the web's `BLOCK_TAG`: a note containing one of these
    /// tags is real HTML the web produced; anything else is markdown-style
    /// plain text and must be left untouched.
    private static let blockTagRegex = try! NSRegularExpression(
        pattern: "<(p|h[1-6]|ul|ol|li|table|div|blockquote|pre|br|hr)[\\s/>]",
        options: [.caseInsensitive]
    )

    static func isHTML(_ s: String) -> Bool {
        let range = NSRange(s.startIndex..., in: s)
        return blockTagRegex.firstMatch(in: s, options: [], range: range) != nil
    }

    /// HTML → markdown-style text. Returns non-HTML input unchanged.
    static func toMarkdown(_ html: String) -> String {
        guard isHTML(html) else { return html }
        let parts = blocks(parseHTML(html)).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        var result = parts.joined(separator: "\n\n").replacingOccurrences(of: "\r\n", with: "\n")
        while result.contains("\n\n\n") { result = result.replacingOccurrences(of: "\n\n\n", with: "\n\n") }
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// First non-empty line of the markdown form, marker-stripped, for row previews.
    static func firstLine(_ notes: String) -> String? {
        let md = toMarkdown(notes)
        guard let raw = md.split(separator: "\n", omittingEmptySubsequences: true)
            .map({ $0.trimmingCharacters(in: .whitespaces) })
            .first(where: { !$0.isEmpty }) else { return nil }
        var line = raw
        if let r = line.range(of: "^#{1,6}\\s+", options: .regularExpression) { line.removeSubrange(r) }
        if let r = line.range(of: "^(-\\s+\\[[ xX]\\]\\s+|[-*]\\s+|\\d+[.)]\\s+|>\\s?)", options: .regularExpression) {
            line.removeSubrange(r)
        }
        return line.trimmingCharacters(in: .whitespaces)
    }

    // MARK: - A tiny HTML tree

    private final class HNode {
        let tag: String
        var attrs: [String: String] = [:]
        var children: [HNode] = []
        var text: String = ""
        init(tag: String, text: String = "") { self.tag = tag; self.text = text }
    }

    private static let voidTags: Set<String> = ["br", "hr", "input", "img"]

    /// Hand-rolled scanner: no WebKit, no NSAttributedString HTML import —
    /// this must be fast, deterministic, and safe to call off the main thread.
    private static func parseHTML(_ html: String) -> [HNode] {
        let chars = Array(html)
        var i = 0
        let root = HNode(tag: "#root")
        var stack = [root]
        while i < chars.count {
            if chars[i] == "<" {
                guard let close = chars[i...].firstIndex(of: ">") else {
                    stack[stack.count - 1].children.append(HNode(tag: "#text", text: String(chars[i...])))
                    break
                }
                let raw = String(chars[(i + 1)..<close])
                i = close + 1
                if raw.hasPrefix("!") { continue } // comment / doctype
                if raw.hasPrefix("/") {
                    let name = raw.dropFirst().trimmingCharacters(in: .whitespaces).lowercased()
                    if let idx = stack.lastIndex(where: { $0.tag == name }) { stack.removeSubrange(idx...) }
                    continue
                }
                let selfClosing = raw.hasSuffix("/")
                let body = selfClosing ? String(raw.dropLast()) : raw
                let spaceIdx = body.firstIndex(where: { $0 == " " || $0 == "\n" || $0 == "\t" })
                let name = String(body[body.startIndex..<(spaceIdx ?? body.endIndex)]).lowercased()
                guard !name.isEmpty else { continue }
                let node = HNode(tag: name)
                if let spaceIdx { node.attrs = parseAttrs(String(body[body.index(after: spaceIdx)...])) }
                stack[stack.count - 1].children.append(node)
                if !selfClosing && !voidTags.contains(name) { stack.append(node) }
            } else {
                guard let next = chars[i...].firstIndex(of: "<") else {
                    stack[stack.count - 1].children.append(HNode(tag: "#text", text: String(chars[i...])))
                    break
                }
                stack[stack.count - 1].children.append(HNode(tag: "#text", text: String(chars[i..<next])))
                i = next
            }
        }
        return root.children
    }

    private static func parseAttrs(_ s: String) -> [String: String] {
        var result: [String: String] = [:]
        var rest = Substring(s)
        while let eq = rest.firstIndex(of: "=") {
            let key = rest[rest.startIndex..<eq].trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            var value = rest[rest.index(after: eq)...]
            guard let quote = value.first, quote == "\"" || quote == "'" else { break }
            value = value.dropFirst()
            guard let endQuote = value.firstIndex(of: quote) else { break }
            if !key.isEmpty { result[key] = String(value[value.startIndex..<endQuote]) }
            rest = value[value.index(after: endQuote)...]
        }
        return result
    }

    private static func decodeEntities(_ s: String) -> String {
        s.replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
    }

    // MARK: - Rendering

    /// Inline run: text plus bold/italic/code/`<br>`. Unknown tags are
    /// stripped, their children flattened in place.
    private static func inline(_ nodes: [HNode]) -> String {
        var out = ""
        for n in nodes {
            switch n.tag {
            case "#text": out += decodeEntities(n.text)
            case "br": out += "\n"
            case "strong", "b": out += "**\(inline(n.children))**"
            case "em", "i": out += "*\(inline(n.children))*"
            case "code": out += "`\(inline(n.children))`"
            case "input": break // task-item checkbox glyph — not text
            default: out += inline(n.children)
            }
        }
        return out
    }

    /// Raw text for a `<pre>` code block — no bold/italic/code markdown, no
    /// entity re-escaping beyond decode. `<br>` (or a literal newline in the
    /// text node, which `<pre>` preserves) both become real newlines.
    private static func codeText(_ nodes: [HNode]) -> String {
        var out = ""
        for n in nodes {
            switch n.tag {
            case "#text": out += decodeEntities(n.text)
            case "br": out += "\n"
            default: out += codeText(n.children)
            }
        }
        return out
    }

    /// Table rows as cell-text arrays. `<thead>`/`<tbody>`/`<tfoot>` are
    /// transparent wrappers; any `<tr>` found (at any depth) contributes a row.
    private static func tableRows(_ nodes: [HNode]) -> [[String]] {
        var rows: [[String]] = []
        for n in nodes {
            if n.tag == "tr" {
                let cells = n.children
                    .filter { $0.tag == "td" || $0.tag == "th" }
                    .map { inline($0.children).trimmingCharacters(in: .whitespacesAndNewlines) }
                if !cells.isEmpty { rows.append(cells) }
            } else {
                rows.append(contentsOf: tableRows(n.children))
            }
        }
        return rows
    }

    /// The content nodes a list item's bullet line and continuations are
    /// built from. A bullet/ordered `<li>` holds them directly; a taskItem
    /// `<li>` wraps them in `<div>` next to the `<label>` checkbox (which is
    /// dropped — it carries no text, `inline` already treats its `<input>`
    /// child as silent).
    private static func liContentNodes(_ li: HNode) -> [HNode] {
        guard li.children.contains(where: { $0.tag == "label" }) else { return li.children }
        if let div = li.children.first(where: { $0.tag == "div" }) { return div.children }
        return li.children.filter { $0.tag != "label" }
    }

    /// Every child of one `<li>`, rendered as markdown lines: the first
    /// text-bearing child becomes the marker line (`- `, `1. `, `- [x] `);
    /// every later child is a continuation, indented two spaces past the
    /// marker's own indent — an extra `<p>` as a plain line, a nested
    /// `<ul>`/`<ol>` as its own indented list (numbering restarts per list,
    /// per `renderListLines`), anything else (a `<pre>`, `<table>`,
    /// `<blockquote>`…) through the generic block renderer. Nothing is
    /// dropped — see the file header for why that matters.
    private static func renderLiLines(_ li: HNode, marker: String, depth: Int) -> [String] {
        let indent = String(repeating: "  ", count: depth)
        let contIndent = indent + "  "
        var lines: [String] = []
        var markerEmitted = false

        func addContentLines(_ text: String) {
            let textLines = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
            guard !textLines.isEmpty else { return }
            for (i, l) in textLines.enumerated() {
                lines.append((!markerEmitted && i == 0 ? indent + marker : contIndent) + l)
            }
            markerEmitted = true
        }

        for child in liContentNodes(li) {
            switch child.tag {
            case "p", "#text":
                let text = (child.tag == "p" ? inline(child.children) : decodeEntities(child.text))
                    .trimmingCharacters(in: .whitespaces)
                if !text.isEmpty || !markerEmitted { addContentLines(text) }
            case "ul", "ol":
                if !markerEmitted { addContentLines("") } // preserve the marker even with no leading text
                lines.append(contentsOf: renderListLines(child, depth: depth + 1))
            default:
                let rendered = blocks([child]).joined(separator: "\n")
                if !rendered.isEmpty { addContentLines(rendered) }
            }
        }
        if !markerEmitted { lines.append(indent + marker) }
        return lines
    }

    /// A `<ul>`/`<ol>` (bullet, ordered, or taskList) as fully indented
    /// markdown lines at the given nesting `depth`. Ordered numbering always
    /// restarts at 1 — that's per-list, not per-document, matching the web's
    /// own `ORDERED` grammar.
    private static func renderListLines(_ node: HNode, depth: Int) -> [String] {
        let items = node.children.filter { $0.tag == "li" }
        let isTaskList = node.attrs["data-type"] == "taskList"
        var lines: [String] = []
        var counter = 1
        for li in items {
            let marker: String
            if node.tag == "ol" {
                marker = "\(counter). "
                counter += 1
            } else if isTaskList {
                marker = li.attrs["data-checked"] == "true" ? "- [x] " : "- [ ] "
            } else {
                marker = "- "
            }
            lines.append(contentsOf: renderLiLines(li, marker: marker, depth: depth))
        }
        return lines
    }

    /// Top-level block elements → markdown blocks, one array entry each.
    /// Blocks are later joined with a blank line, matching the web's grammar
    /// (a blank line is what separates blocks on the way back to HTML).
    private static func blocks(_ nodes: [HNode]) -> [String] {
        var result: [String] = []
        for n in nodes {
            switch n.tag {
            case "h1": result.append("# \(inline(n.children).trimmingCharacters(in: .whitespaces))")
            case "h2": result.append("## \(inline(n.children).trimmingCharacters(in: .whitespaces))")
            case "h3", "h4", "h5", "h6":
                result.append("### \(inline(n.children).trimmingCharacters(in: .whitespaces))")
            case "hr": result.append("---")
            case "ul", "ol":
                let lines = renderListLines(n, depth: 0)
                if !lines.isEmpty { result.append(lines.joined(separator: "\n")) }
            case "pre":
                let code = codeText(n.children).trimmingCharacters(in: .newlines)
                result.append("```\n\(code)\n```")
            case "table":
                let rows = tableRows(n.children)
                let text = rows.map { $0.joined(separator: " | ") }.joined(separator: "\n")
                if !text.isEmpty { result.append(text) }
            case "blockquote":
                let inner = blocks(n.children).joined(separator: "\n\n")
                let quoted = inner.split(separator: "\n", omittingEmptySubsequences: false)
                    .map { $0.isEmpty ? ">" : "> \($0)" }
                    .joined(separator: "\n")
                if !quoted.isEmpty { result.append(quoted) }
            case "p":
                let text = inline(n.children).trimmingCharacters(in: .whitespaces)
                if !text.isEmpty { result.append(text) }
            case "#text":
                let text = decodeEntities(n.text).trimmingCharacters(in: .whitespaces)
                if !text.isEmpty { result.append(text) }
            default:
                // li/div and anything unrecognised: recurse so their
                // block-level content still surfaces instead of vanishing.
                result.append(contentsOf: blocks(n.children))
            }
        }
        return result
    }
}
