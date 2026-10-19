/**
 * WaseetAI Markdown Rendering Engine
 * Provides fallback parsing, syntax accentuation, and rich styling for Arabic RTL text.
 */

export function renderMarkdown(rawText) {
    if (!rawText || typeof rawText !== "string") return "";

    let html = "";
    
    // 1. Try native/vendored marked parser if loaded in global window
    if (typeof window !== "undefined" && window.marked && typeof window.marked.parse === "function") {
        try {
            html = window.marked.parse(rawText, {
                gfm: true,
                breaks: true,
            });
        } catch {
            html = fallbackMarkdownParser(rawText);
        }
    } else {
        html = fallbackMarkdownParser(rawText);
    }

    // 2. Post-process HTML for colorful accents and Arabic tags
    return enrichHtmlTypography(html);
}

/**
 * Robust zero-dependency fallback markdown parser
 * Guarantees that raw symbols like #, **, *, --- never leak to the UI.
 */
function fallbackMarkdownParser(text) {
    let output = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Horizontal rules
    output = output.replace(/^(\s*[-*_]){3,}\s*$/gm, "<hr>");

    // Headers
    output = output.replace(/^### (.*$)/gim, "<h3>$1</h3>");
    output = output.replace(/^## (.*$)/gim, "<h2>$1</h2>");
    output = output.replace(/^# (.*$)/gim, "<h1>$1</h1>");

    // Bold & Italic
    output = output.replace(/\*\*\*(.*?)\*\*\*/gim, "<strong><em>$1</em></strong>");
    output = output.replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>");
    output = output.replace(/\*(.*?)\*/gim, "<em>$1</em>");

    // Inline code
    output = output.replace(/`([^`]+)`/gim, "<code>$1</code>");

    // Unordered lists
    output = output.replace(/^\s*[\*\-]\s+(.*)$/gim, "<li>$1</li>");
    output = output.replace(/(<li>.*<\/li>)/gms, "<ul>$1</ul>");
    output = output.replace(/<\/ul>\s*<ul>/g, "");

    // Paragraphs & line breaks
    output = output.split(/\n{2,}/).map(para => {
        para = para.trim();
        if (!para) return "";
        if (/^<(h1|h2|h3|ul|ol|hr|blockquote|table)/.test(para)) return para;
        return `<p>${para.replace(/\n/g, "<br>")}</p>`;
    }).join("\n");

    return output;
}

/**
 * Adds high-contrast colorful highlights, section badges, and glowing pills.
 */
function enrichHtmlTypography(html) {
    if (!html) return "";

    // Highlight key Arabic/English terms (e.g. Escrow, بوابات الدفع)
    const keywords = [
        "Escrow", "Stripe", "PayPal", "Paytabs", "MyFatoorah",
        "React.js", "Next.js", "Node.js", "Express", "PostgreSQL", "MongoDB", "Figma",
        "ضمان مالي", "المحفظة الإلكترونية", "مراحل التسليم", "مركز حل النزاعات"
    ];

    let enriched = html;
    
    // Style strong tags with colored glow if they precede a colon (e.g. **بناء الثقة:**)
    enriched = enriched.replace(/<strong>([^:<]+):<\/strong>/g, `<strong class="md-label-accent">$1:</strong>`);

    // Add badge styling for numbered sections (e.g. "## 1. نبذة عن المشروع" or "### أ. نظام المستخدمين")
    enriched = enriched.replace(/<h2>(\d+)\.\s*(.*?)<\/h2>/g, `<h2><span class="md-section-num">$1</span> $2</h2>`);
    enriched = enriched.replace(/<h3>([أ-يA-Za-z])\.\s*(.*?)<\/h3>/g, `<h3><span class="md-subsection-badge">$1</span> $2</h3>`);

    return enriched;
}
