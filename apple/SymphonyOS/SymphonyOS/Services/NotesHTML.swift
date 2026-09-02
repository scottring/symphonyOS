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

    /// The text-bearing content of a `<li>` — a bullet/ordered item wraps its
    /// text in `<p>`; a taskItem nests it inside `<label>` (skip) + `<div><p>`.
    private static func liContent(_ li: HNode) -> [HNode] {
        if let p = findFirst(li.children, tag: "p") { return p.children }
        return li.children.filter { $0.tag != "label" }
    }

    private static func findFirst(_ nodes: [HNode], tag: String) -> HNode? {
        for n in nodes {
            if n.tag == tag { return n }
            if let found = findFirst(n.children, tag: tag) { return found }
        }
        return nil
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
            case "ul":
                let items = n.children.filter { $0.tag == "li" }
                let isTaskList = n.attrs["data-type"] == "taskList"
                let lines = items.map { li -> String in
                    let text = inline(liContent(li)).trimmingCharacters(in: .whitespaces)
                    guard isTaskList else { return "- \(text)" }
                    return (li.attrs["data-checked"] == "true" ? "- [x] " : "- [ ] ") + text
                }
                if !lines.isEmpty { result.append(lines.joined(separator: "\n")) }
            case "ol":
                let items = n.children.filter { $0.tag == "li" }
                let lines = items.enumerated().map { index, li in
                    "\(index + 1). \(inline(liContent(li)).trimmingCharacters(in: .whitespaces))"
                }
                if !lines.isEmpty { result.append(lines.joined(separator: "\n")) }
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
                // li/div/table and anything unrecognised: recurse so their
                // block-level content still surfaces instead of vanishing.
                result.append(contentsOf: blocks(n.children))
            }
        }
        return result
    }
}
