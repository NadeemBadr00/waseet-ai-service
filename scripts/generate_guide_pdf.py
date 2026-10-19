# -*- coding: utf-8 -*-
import os
import shutil
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import arabic_reshaper
from bidi.algorithm import get_display

# Register Fonts
pdfmetrics.registerFont(TTFont("Arial", "C:/Windows/Fonts/arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", "C:/Windows/Fonts/arialbd.ttf"))
pdfmetrics.registerFont(TTFont("Courier", "C:/Windows/Fonts/cour.ttf"))

def fix_ar(text):
    if not text:
        return ""
    try:
        reshaped = arabic_reshaper.reshape(text)
        return get_display(reshaped)
    except Exception:
        return text

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        if self._pageNumber == 1:
            return  # Cover page
        self.saveState()
        self.setFont("Arial", 8)
        self.setFillColor(colors.HexColor("#718096"))
        
        # Header
        self.drawString(54, letter[1] - 36, "WaseetAI Microservice - API & Integration Guide")
        self.drawRightString(letter[0] - 54, letter[1] - 36, "Cloud Run Live: v1.0.0")
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.5)
        self.line(54, letter[1] - 42, letter[0] - 54, letter[1] - 42)
        
        # Footer
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(letter[0] - 54, 36, page_text)
        self.drawString(54, 36, "Confidential - Waseet Platform (c) 2026")
        self.line(54, 46, letter[0] - 54, 46)
        self.restoreState()

def build_pdf(filename):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    # Custom styles
    primary_color = colors.HexColor("#1A365D")
    secondary_color = colors.HexColor("#2B6CB0")
    accent_color = colors.HexColor("#319795")
    dark_neutral = colors.HexColor("#2D3748")
    bg_light = colors.HexColor("#F7FAFC")
    code_bg = colors.HexColor("#EDF2F7")

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Arial-Bold',
        fontSize=24,
        leading=30,
        textColor=primary_color,
        alignment=1, # Center
        spaceAfter=10
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Arial',
        fontSize=12,
        leading=16,
        textColor=secondary_color,
        alignment=1,
        spaceAfter=25
    )

    h1_style = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Normal'],
        fontName='Arial-Bold',
        fontSize=16,
        leading=20,
        textColor=primary_color,
        spaceBefore=14,
        spaceAfter=8,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'Heading2_Custom',
        parent=styles['Normal'],
        fontName='Arial-Bold',
        fontSize=12,
        leading=16,
        textColor=secondary_color,
        spaceBefore=10,
        spaceAfter=6,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Arial',
        fontSize=9.5,
        leading=14,
        textColor=dark_neutral,
        spaceAfter=6
    )

    body_arabic = ParagraphStyle(
        'Body_Arabic',
        parent=styles['Normal'],
        fontName='Arial',
        fontSize=9.5,
        leading=14,
        textColor=dark_neutral,
        alignment=2, # Right
        spaceAfter=6
    )

    code_style = ParagraphStyle(
        'Code_Custom',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor("#1A202C")
    )

    story = []

    # Title Page
    story.append(Spacer(1, 40))
    story.append(Paragraph("WaseetAI Platform", title_style))
    story.append(Paragraph("Developer Integration Guide & API Reference", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=primary_color, spaceAfter=20))

    meta_data = [
        [Paragraph("<b>Target System:</b>", body_style), Paragraph("Waseet Freelance Marketplace (dev.waseetai.com)", body_style)],
        [Paragraph("<b>Cloud Service:</b>", body_style), Paragraph("Google Cloud Run (Fully Managed Container)", body_style)],
        [Paragraph("<b>Live Endpoint:</b>", body_style), Paragraph("<code>https://waseet-ai-api-1041761245251.us-central1.run.app</code>", code_style)],
        [Paragraph("<b>Web Console:</b>", body_style), Paragraph("<code>https://waaseet-ai.web.app</code>", code_style)],
        [Paragraph("<b>Authentication:</b>", body_style), Paragraph("Bearer Token (<code>waseet_secret_dev_key_2026</code>)", code_style)],
        [Paragraph("<b>AI Engine:</b>", body_style), Paragraph("Waseet Neural LLM & Neural Voice Engine", body_style)],
        [Paragraph("<b>Version / Date:</b>", body_style), Paragraph("v1.2.0 - September 2026", body_style)]
    ]
    t_meta = Table(meta_data, colWidths=[1.8*inch, 4.7*inch])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), bg_light),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E0")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 25))

    # Executive Summary (Arabic & English)
    story.append(Paragraph("دليل التكامل الهندسي لمبرمج منصة وسيط", h1_style))
    story.append(Paragraph(fix_ar("هذا الدليل مخصص لمبرمجي ومطوري منصة وسيط للعمل الحر (dev.waseetai.com) لربط واستدعاء خدمات الذكاء الاصطناعي السحابية. السيرفر مستضاف بالكامل على Google Cloud Run ويعمل كـ Microservice مستقلة تدعم بروتوكولات RESTful و SSE و Socket.IO، بالإضافة إلى ميزة التحدث ونطق اللهجات العربية بصوت حقيقي فائق الجودة بتقنية Waseet Neural Voice المتطورة."), body_arabic))
    story.append(Spacer(1, 15))

    story.append(PageBreak())

    # Section 1: Architecture & Endpoints Overview
    story.append(Paragraph("1. Global Endpoints & Authentication", h1_style))
    story.append(Paragraph("All requests must include the Bearer authentication token in the HTTP Authorization header. Cross-Origin Resource Sharing (CORS) is enabled globally with wildcard origin (<code>*</code>), allowing seamless invocation from browsers, mobile apps, or backend servers.", body_style))

    story.append(Spacer(1, 8))
    auth_table = [
        [Paragraph("<b>Header</b>", body_style), Paragraph("<b>Value</b>", body_style)],
        [Paragraph("<code>Authorization</code>", code_style), Paragraph("<code>Bearer waseet_secret_dev_key_2026</code>", code_style)],
        [Paragraph("<code>Content-Type</code>", code_style), Paragraph("<code>application/json</code>", code_style)]
    ]
    t_auth = Table(auth_table, colWidths=[2.2*inch, 4.3*inch])
    t_auth.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#E2E8F0")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E0")),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_auth)
    story.append(Spacer(1, 15))

    # Section 2: Core Endpoints Summary Table
    story.append(Paragraph("2. Complete Endpoints Summary Table", h1_style))
    ep_rows = [
        [Paragraph("<b>Method & Endpoint</b>", body_style), Paragraph("<b>Category</b>", body_style), Paragraph("<b>Description</b>", body_style)],
        [Paragraph("<code>GET /health</code>", code_style), Paragraph("System", body_style), Paragraph("Health check & uptime status", body_style)],
        [Paragraph("<code>POST /v1/ai/project-description/stream</code>", code_style), Paragraph("Projects", body_style), Paragraph("Live SSE project scope & description", body_style)],
        [Paragraph("<code>POST /v1/ai/milestones</code>", code_style), Paragraph("Projects", body_style), Paragraph("100% financial escrow milestones", body_style)],
        [Paragraph("<code>POST /v1/ai/projects/feasibility</code>", code_style), Paragraph("Projects", body_style), Paragraph("Feasibility audit & risk scoring", body_style)],
        [Paragraph("<code>POST /v1/ai/projects/draft</code>", code_style), Paragraph("Projects", body_style), Paragraph("Draft proposal for non-tech clients", body_style)],
        [Paragraph("<code>POST /v1/ai/assessments/generate</code>", code_style), Paragraph("Exams", body_style), Paragraph("Generate specialty MCQ exam questions", body_style)],
        [Paragraph("<code>POST /v1/ai/assessments/evaluate</code>", code_style), Paragraph("Exams", body_style), Paragraph("Deterministic scoring & pass/fail", body_style)],
        [Paragraph("<code>POST /v1/ai/proposals/enrich</code>", code_style), Paragraph("Proposals", body_style), Paragraph("Proposal audit & win-rate boost (§12)", body_style)],
        [Paragraph("<code>POST /v1/ai/proposals/suggest</code>", code_style), Paragraph("Proposals", body_style), Paragraph("Proposal drafting & price guidance", body_style)],
        [Paragraph("<code>POST /v1/ai/marketplace/matching</code>", code_style), Paragraph("Marketplace", body_style), Paragraph("Project-freelancer AI matchmaking", body_style)],
        [Paragraph("<code>POST /v1/ai/providers/profile-metrics</code>", code_style), Paragraph("Providers", body_style), Paragraph("8 performance badges calculation", body_style)],
        [Paragraph("<code>POST /v1/ai/disputes/summary</code>", code_style), Paragraph("Disputes", body_style), Paragraph("Impartial dispute analysis", body_style)],
        [Paragraph("<code>POST /v1/ai/help/chat</code>", code_style), Paragraph("Support", body_style), Paragraph("RAG customer support stream with fallback", body_style)],
        [Paragraph("<code>POST /v1/ai/avatar/chat</code>", code_style), Paragraph("Avatar", body_style), Paragraph("Avatar text + synthesized WAV speech", body_style)],
        [Paragraph("<code>POST /v1/ai/tts/synthesize</code>", code_style), Paragraph("Speech", body_style), Paragraph("Waseet Neural Voice with dialects", body_style)],
        [Paragraph("<code>GET /v1/ai/tts/speak</code>", code_style), Paragraph("Speech", body_style), Paragraph("Direct binary audio stream (HTML5 audio)", body_style)],
        [Paragraph("<code>POST /v1/ai/tts/stream</code>", code_style), Paragraph("Speech", body_style), Paragraph("Real-time SSE audio chunk streaming", body_style)],
        [Paragraph("<code>GET /v1/ai/tts/catalog</code>", code_style), Paragraph("Speech", body_style), Paragraph("List of voices, models, and dialects", body_style)]
    ]
    t_ep = Table(ep_rows, colWidths=[2.7*inch, 1.1*inch, 2.7*inch])
    t_ep.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E0")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, bg_light]),
        ('PADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_ep)

    story.append(PageBreak())

    # Section 3: Text-to-Speech (TTS) & Dialects
    story.append(Paragraph("3. Waseet Neural Voice Generation (TTS) & Dialects", h1_style))
    story.append(Paragraph("The WaseetAI service integrates high-definition neural speech synthesis (Waseet Voice Lite, Waseet Voice Turbo, and Waseet Voice Pro) with multi-engine failover across the cloud cluster to guarantee ultra-low latency, natural prosody, and zero downtime.", body_style))
    story.append(Spacer(1, 8))

    story.append(Paragraph("Endpoint: POST /v1/ai/tts/synthesize", h2_style))
    tts_payload_code = (
        '{\n'
        '  "text": "يا أهلاً بيك يا فندم في منصة وسيط! إحنا هنا علشان نضمنلك كل مليم في مشروعك.",\n'
        '  "model": "AUTO",                     // AUTO | waseet-voice-lite | waseet-voice-turbo | waseet-voice-pro\n'
        '  "voice": "Puck",                     // Puck | Kore | Fenrir | Aoede | Zephyr | Sulafat | Charon\n'
        '  "dialect": "egyptian",               // egyptian | gulf | saudi | msa | english\n'
        '  "speakingRate": "normal",            // normal | slow | rapid\n'
        '  "mimeType": "audio/wav"              // audio/wav | audio/l16 | audio/mulaw\n'
        '}'
    )
    story.append(Table([[Paragraph(tts_payload_code.replace("\n", "<br/>").replace(" ", "&nbsp;"), code_style)]], colWidths=[6.5*inch], style=[('BACKGROUND', (0,0), (-1,-1), code_bg), ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E0")), ('PADDING', (0,0), (-1,-1), 6)]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Direct Audio Playback via HTML5 Audio:", h2_style))
    story.append(Paragraph("Frontend applications can directly embed audio using standard HTML5 tags without handling base64 decoding manually:", body_style))
    audio_tag_code = '<audio src="https://waseet-ai-api-1041761245251.us-central1.run.app/v1/ai/tts/speak?text=مرحبا+بكم&dialect=egyptian&voice=Puck" controls autoplay></audio>'
    story.append(Table([[Paragraph(audio_tag_code.replace("<", "&lt;").replace(">", "&gt;"), code_style)]], colWidths=[6.5*inch], style=[('BACKGROUND', (0,0), (-1,-1), code_bg), ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E0")), ('PADDING', (0,0), (-1,-1), 6)]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Supported Dialects & Voice Personas:", h2_style))
    voices_data = [
        [Paragraph("<b>Dialect / Accent</b>", body_style), Paragraph("<b>Prompt Adaptation</b>", body_style), Paragraph("<b>Recommended Voice</b>", body_style)],
        [Paragraph("Egyptian (لهجة مصرية)", body_style), Paragraph("Warm, lively, expressive, friendly", body_style), Paragraph("<code>Puck</code> (Male) or <code>Kore</code> (Female)", code_style)],
        [Paragraph("Gulf (لهجة خليجية)", body_style), Paragraph("Hospitable, polite, calm, dignified", body_style), Paragraph("<code>Puck</code> / <code>Aoede</code>", code_style)],
        [Paragraph("Saudi (لهجة سعودية)", body_style), Paragraph("Welcoming, confident, articulate", body_style), Paragraph("<code>Puck</code> / <code>Kore</code>", code_style)],
        [Paragraph("MSA (فصحى معاصرة)", body_style), Paragraph("Clear, eloquent, authoritative", body_style), Paragraph("<code>Charon</code> / <code>Kore</code>", code_style)],
        [Paragraph("English", body_style), Paragraph("Professional, clear and engaging", body_style), Paragraph("<code>Zephyr</code> / <code>Puck</code>", code_style)]
    ]
    t_voices = Table(voices_data, colWidths=[1.8*inch, 2.7*inch, 2.0*inch])
    t_voices.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#E2E8F0")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E0")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, bg_light]),
        ('PADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_voices)

    story.append(PageBreak())

    # Section 4: Full Code Integration Examples
    story.append(Paragraph("4. Frontend Integration Examples (TypeScript / JavaScript)", h1_style))
    story.append(Paragraph("The following snippet shows how dev.waseetai.com can consume both text generation and voice synthesis directly:", body_style))

    js_code = (
        '// 1. Text-To-Speech Synthesis\n'
        'async function speakText(message, dialect = "egyptian") {\n'
        '  const res = await fetch("https://waseet-ai-api-1041761245251.us-central1.run.app/v1/ai/tts/synthesize", {\n'
        '    method: "POST",\n'
        '    headers: {\n'
        '      "Content-Type": "application/json",\n'
        '      "Authorization": "Bearer waseet_secret_dev_key_2026"\n'
        '    },\n'
        '    body: JSON.stringify({\n'
        '      text: message,\n'
        '      model: "AUTO",\n'
        '      voice: "Puck",\n'
        '      dialect: dialect\n'
        '    })\n'
        '  });\n'
        '  const json = await res.json();\n'
        '  const audio = new Audio("data:audio/wav;base64," + json.data.audio.base64Audio);\n'
        '  audio.play();\n'
        '}\n\n'
        '// 2. Server-Sent Events (SSE) Live Description Streaming\n'
        'async function streamProjectDescription(title, category, onChunk) {\n'
        '  const res = await fetch("https://waseet-ai-api-1041761245251.us-central1.run.app/v1/ai/project-description/stream", {\n'
        '    method: "POST",\n'
        '    headers: {\n'
        '      "Content-Type": "application/json",\n'
        '      "Authorization": "Bearer waseet_secret_dev_key_2026"\n'
        '    },\n'
        '    body: JSON.stringify({ title, category })\n'
        '  });\n'
        '  const reader = res.body.getReader();\n'
        '  const decoder = new TextDecoder();\n'
        '  while (true) {\n'
        '    const { done, value } = await reader.read();\n'
        '    if (done) break;\n'
        '    const text = decoder.decode(value);\n'
        '    for (const line of text.split("\\n")) {\n'
        '      if (line.startsWith("data: ")) {\n'
        '        const data = JSON.parse(line.slice(6));\n'
        '        if (data.chunk) onChunk(data.chunk);\n'
        '      }\n'
        '    }\n'
        '  }\n'
        '}'
    )
    story.append(Table([[Paragraph(js_code.replace("\n", "<br/>").replace(" ", "&nbsp;"), code_style)]], colWidths=[6.5*inch], style=[('BACKGROUND', (0,0), (-1,-1), code_bg), ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E0")), ('PADDING', (0,0), (-1,-1), 6)]))

    story.append(Spacer(1, 15))
    story.append(Paragraph("5. High-Availability Multi-Cluster Architecture & Resilience", h1_style))
    story.append(Paragraph("The backend microservice encapsulates an automated high-availability multi-cluster architecture. It executes intelligent load balancing, proactive rate tracking, distributed connection pooling, and automatic failover whenever transient loads are encountered, guaranteeing virtually uninterrupted 99.9% uptime without manual intervention.", body_style))

    doc.build(story, canvasmaker=NumberedCanvas)

if __name__ == "__main__":
    out_pdf = "WaseetAI_API_Integration_Guide.pdf"
    build_pdf(out_pdf)
    print("PDF Generated:", out_pdf)
    
    # Copy to destination folders
    desktop_path = os.path.expanduser("~/Desktop/WaseetAI_API_Integration_Guide.pdf")
    shutil.copyfile(out_pdf, desktop_path)
    shutil.copyfile(out_pdf, "docs/" + out_pdf)
    shutil.copyfile(out_pdf, "public/" + out_pdf)
    print("Copied to Desktop, docs, and public directories.")
