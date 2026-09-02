import Testing
@testable import Symphony

/// Twin of the web's `notesToHtml` run in reverse — see `src/lib/notes/notesToHtml.ts`
/// and `Services/NotesHTML.swift`. The bug this guards: task/event notes written
/// on the web are Tiptap HTML, and the phone was rendering the raw tags.
struct NotesHTMLTests {
    // MARK: - isHTML

    @Test func isHTMLTrueForBlockTags() {
        #expect(NotesHTML.isHTML("<h3>Heading</h3>"))
        #expect(NotesHTML.isHTML("<p>Paragraph</p>"))
        #expect(NotesHTML.isHTML("<ul><li><p>Item</p></li></ul>"))
        #expect(NotesHTML.isHTML("Some text<br>more text"))
        #expect(NotesHTML.isHTML("<hr>"))
    }

    @Test func isHTMLFalseForPlainAndMarkdownText() {
        #expect(!NotesHTML.isHTML("Just a plain note."))
        #expect(!NotesHTML.isHTML("### A heading\n\n- a bullet\n- another"))
        // A literal "<" in prose, with no recognised block tag, is not HTML.
        #expect(!NotesHTML.isHTML("Revenue < costs this quarter, watch it."))
        #expect(!NotesHTML.isHTML(""))
    }

    // MARK: - toMarkdown: passthrough

    @Test func toMarkdownLeavesNonHTMLUnchanged() {
        let text = "### A heading\n\n- a bullet\n- another\n\nRevenue < costs this quarter."
        #expect(NotesHTML.toMarkdown(text) == text)
    }

    // MARK: - toMarkdown: the exact bug fixture

    @Test func toMarkdownConvertsTheBugFixture() {
        let html = "<h3>SIVIA / CHRISTIAN MEJIA — CONTEXT FOR RESPONSE</h3>" +
            "<h3>WHAT THEY ARE PROPOSING</h3>" +
            "<ul><li><p>Sivia is acting as a full-service RIA.</p></li>" +
            "<li><p>Proposed allocation: 60% / 40%.</p></li></ul>" +
            "<p>THE TWO SCENARIOS<br>Both share the same base assumptions:</p>"

        let expected = "### SIVIA / CHRISTIAN MEJIA — CONTEXT FOR RESPONSE\n\n" +
            "### WHAT THEY ARE PROPOSING\n\n" +
            "- Sivia is acting as a full-service RIA.\n" +
            "- Proposed allocation: 60% / 40%.\n\n" +
            "THE TWO SCENARIOS\nBoth share the same base assumptions:"

        #expect(NotesHTML.toMarkdown(html) == expected)
        // No tag should survive into the rendered text.
        #expect(!NotesHTML.toMarkdown(html).contains("<"))
    }

    // MARK: - Lists

    @Test func toMarkdownNumbersOrderedLists() {
        let html = "<ol><li><p>First</p></li><li><p>Second</p></li><li><p>Third</p></li></ol>"
        #expect(NotesHTML.toMarkdown(html) == "1. First\n2. Second\n3. Third")
    }

    @Test func toMarkdownRendersTaskItems() {
        let html = "<ul data-type=\"taskList\">" +
            "<li data-type=\"taskItem\" data-checked=\"true\">" +
            "<label><input type=\"checkbox\" checked><span></span></label><div><p>Done thing</p></div></li>" +
            "<li data-type=\"taskItem\" data-checked=\"false\">" +
            "<label><input type=\"checkbox\"><span></span></label><div><p>Open thing</p></div></li>" +
            "</ul>"
        #expect(NotesHTML.toMarkdown(html) == "- [x] Done thing\n- [ ] Open thing")
    }

    // MARK: - Entities and inline formatting

    @Test func toMarkdownDecodesEntities() {
        #expect(NotesHTML.toMarkdown("<p>Sivia &amp; Christian &lt;call&gt; &quot;now&quot;</p>")
            == "Sivia & Christian <call> \"now\"")
    }

    @Test func toMarkdownRendersInlineFormatting() {
        #expect(NotesHTML.toMarkdown("<p><strong>Bold</strong> and <em>italic</em> and <code>code</code>.</p>")
            == "**Bold** and *italic* and `code`.")
    }

    // MARK: - Idempotence (round-trip sanity)

    @Test func toMarkdownIsIdempotent() {
        let html = "<h3>SIVIA / CHRISTIAN MEJIA — CONTEXT FOR RESPONSE</h3>" +
            "<ul><li><p>Sivia is acting as a full-service RIA.</p></li></ul>" +
            "<p>THE TWO SCENARIOS<br>Both share the same base assumptions:</p>"
        let once = NotesHTML.toMarkdown(html)
        let twice = NotesHTML.toMarkdown(once)
        #expect(once == twice)
    }

    // MARK: - firstLine

    @Test func firstLineStripsMarkersFromHTML() {
        let html = "<h3>WHAT THEY ARE PROPOSING</h3><p>Body text here.</p>"
        #expect(NotesHTML.firstLine(html) == "WHAT THEY ARE PROPOSING")
    }

    @Test func firstLineStripsBulletAndTaskMarkers() {
        #expect(NotesHTML.firstLine("<ul><li><p>Buy milk</p></li></ul>") == "Buy milk")
        #expect(NotesHTML.firstLine(
            "<ul data-type=\"taskList\"><li data-type=\"taskItem\" data-checked=\"false\">" +
            "<label><input type=\"checkbox\"><span></span></label><div><p>Pack lunch</p></div></li></ul>"
        ) == "Pack lunch")
    }

    @Test func firstLineOnPlainTextReturnsFirstNonEmptyLine() {
        #expect(NotesHTML.firstLine("\n\nCall the vendor back.\nSecond line.") == "Call the vendor back.")
    }

    @Test func firstLineOnEmptyNotesReturnsNil() {
        #expect(NotesHTML.firstLine("") == nil)
        #expect(NotesHTML.firstLine("   ") == nil)
    }

    // MARK: - Nested lists, extra paragraphs, code blocks, tables (fix round 1)
    //
    // `liContent` used to grab only the first `<p>` inside an `<li>` and drop
    // every sibling after it — a nested list or a second paragraph vanished
    // silently, and an edit on the phone wrote the truncated note straight
    // back. These pin the fix: every child of every `<li>` survives, indented
    // two spaces per nesting level.

    @Test func toMarkdownRendersNestedBulletUnderBullet() {
        let html = "<ul><li><p>Parent</p><ul><li><p>Child</p></li></ul></li></ul>"
        #expect(NotesHTML.toMarkdown(html) == "- Parent\n  - Child")
    }

    @Test func toMarkdownRendersNestedTaskItemUnderTaskItem() {
        let html = "<ul data-type=\"taskList\">" +
            "<li data-type=\"taskItem\" data-checked=\"false\">" +
            "<label><input type=\"checkbox\"><span></span></label>" +
            "<div><p>Parent task</p>" +
            "<ul data-type=\"taskList\">" +
            "<li data-type=\"taskItem\" data-checked=\"true\">" +
            "<label><input type=\"checkbox\" checked><span></span></label><div><p>Child task</p></div></li>" +
            "</ul></div></li></ul>"
        #expect(NotesHTML.toMarkdown(html) == "- [ ] Parent task\n  - [x] Child task")
    }

    @Test func toMarkdownKeepsEveryParagraphInAListItem() {
        let html = "<ul><li><p>Para 1</p><p>Para 2</p></li></ul>"
        #expect(NotesHTML.toMarkdown(html) == "- Para 1\n  Para 2")
    }

    @Test func toMarkdownRestartsNumberingForOrderedListNestedInBullet() {
        let html = "<ul><li><p>Item</p><ol><li><p>Sub one</p></li><li><p>Sub two</p></li></ol></li></ul>"
        #expect(NotesHTML.toMarkdown(html) == "- Item\n  1. Sub one\n  2. Sub two")
    }

    @Test func toMarkdownFencesCodeBlocks() {
        let html = "<pre><code>const x = 1;\nconsole.log(x);</code></pre>"
        #expect(NotesHTML.toMarkdown(html) == "```\nconst x = 1;\nconsole.log(x);\n```")
    }

    @Test func toMarkdownFlattensTablesReadably() {
        let html = "<table><tbody>" +
            "<tr><td><p>A1</p></td><td><p>B1</p></td></tr>" +
            "<tr><td><p>A2</p></td><td><p>B2</p></td></tr>" +
            "</tbody></table>"
        #expect(NotesHTML.toMarkdown(html) == "A1 | B1\nA2 | B2")
    }
}
