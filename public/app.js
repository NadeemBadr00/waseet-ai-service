import { WaseetApiClient } from "./api-client.js?v=11";
import { renderMarkdown } from "./markdown-renderer.js?v=9";

function sanitizeAiBranding(textOrObj) {
    if (!textOrObj) return textOrObj;
    if (typeof textOrObj === "string") {
        return textOrObj
            .replace(/gemini-paid-primary/gi, "waseet-cloud-primary")
            .replace(/gemini-free-0\d/gi, "waseet-cloud-cluster")
            .replace(/gemini-3\.8-flash-lite-tts/gi, "waseet-voice-lite")
            .replace(/gemini-3\.1-flash-tts-preview/gi, "waseet-voice-turbo")
            .replace(/gemini-3\.8-flash-tts/gi, "waseet-voice-pro")
            .replace(/gemini-3\.1-flash-lite/gi, "waseet-turbo-3.1")
            .replace(/gemini-3\.5-flash-lite/gi, "waseet-turbo-3.5")
            .replace(/gemini-3\.5-flash/gi, "waseet-neural-3.5")
            .replace(/gemini-3\.6-flash/gi, "waseet-neural-3.6")
            .replace(/gemini-3\.7-flash/gi, "waseet-neural-3.7")
            .replace(/gemini-3\.8-flash/gi, "waseet-ultra-3.8")
            .replace(/gemini-2\.5-flash/gi, "waseet-global-2.5")
            .replace(/gemini/gi, "waseet-ai")
            .replace(/56-Pool Router/gi, "Smart Router")
            .replace(/56 كوتا/gi, "Waseet Cloud");
    }
    try {
        const jsonStr = JSON.stringify(textOrObj);
        return JSON.parse(sanitizeAiBranding(jsonStr));
    } catch {
        return textOrObj;
    }
}

const state = {
    activeTab: "projects",
    activeSubTab: "stream",
    currentAttemptId: null,
    selectedAnswers: {},
    lastGeneratedRawMarkdown: "",
};

const dom = {
    breadcrumb: document.getElementById("breadcrumbSection"),
    headerTitle: document.getElementById("headerTitle"),
    subTabsNav: document.getElementById("subTabsNav"),
    latency: document.getElementById("latencyIndicator"),
    streamBox: document.getElementById("streamOutputBox"),
    streamReqViewer: document.getElementById("streamReqViewer"),
    streamResViewer: document.getElementById("streamResViewer"),
    streamBadge: document.getElementById("streamBadge"),
    copyBtn: document.getElementById("copyOutputBtn"),
    copyBtnText: document.getElementById("copyBtnText"),
};

// Tab and Subtab Routing with Deep Links
function routeFromHash() {
    const rawHash = (window.location.hash || "").replace(/^#/, "");
    const parts = rawHash.split("/");
    const mainTab = parts[0] || "projects";
    const subTab = parts[1] || (mainTab === "projects" ? "stream" : null);

    switchTab(mainTab, subTab, false);
}

window.addEventListener("hashchange", routeFromHash);

function switchTab(tabId, subTabId = "stream", updateHash = true) {
    state.activeTab = tabId;
    state.activeSubTab = subTabId || "stream";

    // Update Sidebar active state
    document.querySelectorAll(".sidebar-nav .nav-link").forEach((l) => l.classList.remove("active"));
    document.querySelector(`.sidebar-nav [data-tab="${tabId}"]`)?.classList.add("active");

    // Update Tab Panels
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    const activePanel = document.getElementById(`panel-${tabId}`);
    if (activePanel) activePanel.classList.add("active");

    const titles = {
        projects: "مختبر خدمات المشاريع (Projects Lab)",
        assessments: "الاختبارات والتصحيح الحتمي (Assessments Lab)",
        proposals: "العروض والمطابقة (Marketplace Lab)",
        disputes: "النزاعات وصحة المشاريع (Disputes & Health Lab)",
        help: "الدعم الفني والأفاتار (RAG & Avatar Lab)",
    };

    dom.headerTitle.childNodes[0].textContent = titles[tabId] || "WaseetAI Console";
    dom.breadcrumb.textContent = titles[tabId] || tabId;
    dom.subTabsNav.style.display = tabId === "projects" ? "flex" : "none";

    // Handle Subpanels for Projects
    if (tabId === "projects") {
        document.querySelectorAll("#subTabsNav .tab").forEach((btn) => {
            btn.classList.toggle("active", btn.getAttribute("data-subtab") === state.activeSubTab);
        });

        document.querySelectorAll("#panel-projects .subpanel").forEach((sp) => {
            sp.style.display = sp.id === `subpanel-${state.activeSubTab}` ? "block" : "none";
        });
    }

    if (updateHash) {
        const targetHash = tabId === "projects" ? `#projects/${state.activeSubTab}` : `#${tabId}`;
        if (window.location.hash !== targetHash) {
            history.pushState(null, "", targetHash);
        }
    }
}

// Subtabs click listener
dom.subTabsNav.querySelectorAll(".tab").forEach((tabLink) => {
    tabLink.addEventListener("click", (e) => {
        e.preventDefault();
        const sub = tabLink.getAttribute("data-subtab");
        switchTab("projects", sub, true);
    });
});

// Sidebar nav links click listener
document.querySelectorAll(".sidebar-nav .nav-link").forEach((link) => {
    link.addEventListener("click", (e) => {
        e.preventDefault();
        const tab = link.getAttribute("data-tab");
        const sub = tab === "projects" ? (state.activeSubTab || "stream") : null;
        switchTab(tab, sub, true);
    });
});

// Sidebar & Theme
document.getElementById("collapseBtn")?.addEventListener("click", () => {
    document.getElementById("consoleShell").classList.toggle("is-sidebar-collapsed");
});

document.getElementById("themeToggleBtn")?.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
});

// Generic Inspector Tab Switching (Request vs Response)
document.addEventListener("click", (e) => {
    const tabBtn = e.target.closest(".inspector-tab-btn");
    if (!tabBtn) return;
    const inspector = tabBtn.closest(".json-inspector");
    if (!inspector) return;

    inspector.querySelectorAll(".inspector-tab-btn").forEach((b) => b.classList.remove("active"));
    tabBtn.classList.add("active");

    const targetBase = tabBtn.getAttribute("data-target");
    const targetViewerId = `${targetBase}Viewer`;

    inspector.querySelectorAll(".json-viewer").forEach((v) => {
        if (v.id === targetViewerId) {
            v.classList.remove("is-hidden");
        } else {
            v.classList.add("is-hidden");
        }
    });
});

// Projects Execution (Stream Description)
document.getElementById("runProjectActionBtn")?.addEventListener("click", async () => {
    const title = document.getElementById("projectTitleInput").value;
    const budget = Number(document.getElementById("projectBudgetInput").value);
    const duration = Number(document.getElementById("projectDurationInput").value);
    const prompt = document.getElementById("projectPromptInput").value;
    const modelSelection = document.getElementById("projectModelTier")?.value || "AUTO";
    const preferredModel = modelSelection === "AUTO" ? "" : modelSelection;
    const modelTier = "LIGHT";

    dom.streamBadge.textContent = "جاري المعالجة...";
    dom.streamBadge.className = "badge badge-info";

    if (state.activeSubTab === "stream") {
        dom.streamBox.textContent = "جاري الاتصال بمحرك Waseet AI واستقبال النص لايف...";
        const t0 = Date.now();
        let chunkCount = 0;
        let fullMarkdownText = "";
        let usedModel = preferredModel || "waseet-neural-flash";
        let usedProject = "waseet-cluster-core";

        // Set Input Request JSON Viewer
        const reqPayload = {
            endpoint: "/v1/ai/project-description/stream",
            method: "POST",
            headers: {
                "Authorization": "Bearer waseet_secret_dev_key_2026",
                "Content-Type": "application/json"
            },
            body: {
                title,
                category: prompt,
                language: "ar",
                modelTier,
                preferredModel: preferredModel || "AUTO (Smart Router)"
            },
            budget,
            durationDays: duration,
            timestamp: new Date().toISOString()
        };
        if (dom.streamReqViewer) dom.streamReqViewer.textContent = JSON.stringify(reqPayload, null, 2);

        // Initial Output Response State
        if (dom.streamResViewer) {
            dom.streamResViewer.textContent = JSON.stringify({
                status: "connecting",
                protocol: "Server-Sent Events (SSE)",
                endpoint: "/v1/ai/project-description/stream",
                selectedModel: sanitizeAiBranding(preferredModel || "AUTO"),
                selectedTier: modelTier,
                timestamp: new Date().toISOString()
            }, null, 2);
        }

        await WaseetApiClient.streamDescription(
            title,
            prompt,
            (chunk, model, project) => {
                if (model) usedModel = model;
                if (project) usedProject = project;
                fullMarkdownText += chunk;
                chunkCount++;

                state.lastGeneratedRawMarkdown = fullMarkdownText;
                dom.streamBox.innerHTML = renderMarkdown(fullMarkdownText);

                if (dom.streamResViewer) {
                    dom.streamResViewer.textContent = JSON.stringify(sanitizeAiBranding({
                        status: "streaming",
                        model: usedModel,
                        server: "waseet-cloud-cluster",
                        chunksReceived: chunkCount,
                        totalCharacters: fullMarkdownText.length,
                        latestChunkSample: chunk.slice(0, 30) + (chunk.length > 30 ? "..." : ""),
                        elapsedMs: Date.now() - t0,
                    }), null, 2);
                }
            },
            () => {
                const totalMs = Date.now() - t0;
                dom.streamBadge.textContent = `${sanitizeAiBranding(usedModel)} (${totalMs}ms)`;
                dom.streamBadge.className = "badge badge-success";
                dom.latency.textContent = `اكتمل في: ${totalMs}ms`;
                if (dom.streamResViewer) {
                    dom.streamResViewer.textContent = JSON.stringify(sanitizeAiBranding({
                        status: "completed",
                        protocol: "Server-Sent Events (SSE)",
                        endpoint: "/v1/ai/project-description/stream",
                        modelUsed: usedModel,
                        serverUsed: "waseet-cloud-cluster",
                        chunksReceived: chunkCount,
                        totalCharacters: fullMarkdownText.length,
                        durationMs: totalMs,
                        completedAt: new Date().toISOString(),
                        response: {
                            text: fullMarkdownText
                        }
                    }), null, 2);
                }
            },
            (err) => {
                dom.streamBox.textContent = `تعذر التوليد: ${err.message}\n(قد ترجع سيرفرات جوجل ضغط مؤقت 503، جرب مرة أخرى أو جرب زر المراحل والاختبارات)`;
                dom.streamBadge.textContent = "تنبيه";
                dom.streamBadge.className = "badge badge-warning";
                if (dom.streamResViewer) {
                    dom.streamResViewer.textContent = JSON.stringify({ status: "error", message: err.message }, null, 2);
                }
            },
            modelTier,
            preferredModel
        );
    }
});

// Milestones Execution
document.getElementById("runMilestonesBtn")?.addEventListener("click", async () => {
    const title = document.getElementById("msTitleInput")?.value || "مشروع جديد";
    const totalAmount = Number(document.getElementById("msBudgetInput")?.value || 4000);
    const currency = document.getElementById("msCurrencySelect")?.value || "USD";
    const description = document.getElementById("msDescInput")?.value || "";
    const box = document.getElementById("milestonesOutputBox");
    const badge = document.getElementById("msBadge");
    const latency = document.getElementById("msLatencyIndicator");
    const reqViewer = document.getElementById("msReqViewer");
    const resViewer = document.getElementById("msResViewer");

    const reqPayload = {
        endpoint: "/v1/ai/milestones",
        method: "POST",
        headers: {
            "Authorization": "Bearer waseet_secret_dev_key_2026",
            "Content-Type": "application/json"
        },
        body: { title, description, totalAmount, currency },
        timestamp: new Date().toISOString()
    };
    if (reqViewer) reqViewer.textContent = JSON.stringify(reqPayload, null, 2);
    if (resViewer) resViewer.textContent = JSON.stringify({ status: "processing...", endpoint: "/v1/ai/milestones" }, null, 2);

    box.textContent = "جاري حساب وتقسيم المراحل بنسب ومبالغ دقيقة 100%...";
    if (badge) {
        badge.textContent = "جاري الحساب...";
        badge.className = "badge badge-info";
    }
    if (latency) latency.textContent = "جاري المعالجة...";

    const { data, status, duration } = await WaseetApiClient.call("/v1/ai/milestones", "POST", { title, description, totalAmount, currency });
    
    if (latency) latency.textContent = `اكتمل في: ${duration}ms`;

    if (resViewer) {
        resViewer.textContent = JSON.stringify({
            status,
            durationMs: duration,
            response: data
        }, null, 2);
    }

    if (data && data.success && data.data?.milestones) {
        let html = `<table class="milestone-table"><thead><tr><th>المرحلة</th><th>الوصف</th><th>المدة</th><th>النسبة</th><th>المبلغ (${currency})</th></tr></thead><tbody>`;
        let pTot = 0, dTot = 0;
        data.data.milestones.forEach((m) => {
            pTot += m.percentage; dTot += m.amount;
            html += `<tr><td><strong>${m.title}</strong></td><td>${m.description}</td><td>${m.days} يوم</td><td>${m.percentage}%</td><td>${currency} ${m.amount}</td></tr>`;
        });
        html += `</tbody><tfoot><tr><td colspan="3"><strong>الإجمالي الدقيق</strong></td><td><strong>${pTot}%</strong></td><td><strong>${currency} ${dTot}</strong></td></tr></tfoot></table>`;
        box.innerHTML = html;
        if (badge) {
            badge.textContent = `100% مدقق (${duration}ms)`;
            badge.className = "badge badge-success";
        }
    } else {
        box.textContent = JSON.stringify(data, null, 2);
        if (badge) {
            badge.textContent = `خطأ (${status})`;
            badge.className = "badge badge-danger";
        }
    }
});

// Plan Analysis Execution
document.getElementById("runAnalysisBtn")?.addEventListener("click", async () => {
    const title = document.getElementById("anTitleInput")?.value || "مشروع جديد";
    const budget = Number(document.getElementById("anBudgetInput")?.value || 1500);
    const deadlineDays = Number(document.getElementById("anDurationInput")?.value || 15);
    const description = document.getElementById("anDescInput")?.value || "";
    const box = document.getElementById("analysisOutputBox");
    const badge = document.getElementById("anBadge");
    const latency = document.getElementById("anLatencyIndicator");
    const reqViewer = document.getElementById("anReqViewer");
    const resViewer = document.getElementById("anResViewer");

    const reqPayload = {
        endpoint: "/v1/ai/project-analysis",
        method: "POST",
        headers: {
            "Authorization": "Bearer waseet_secret_dev_key_2026",
            "Content-Type": "application/json"
        },
        body: { title, description, budget, deadlineDays, currency: "USD" },
        timestamp: new Date().toISOString()
    };
    if (reqViewer) reqViewer.textContent = JSON.stringify(reqPayload, null, 2);
    if (resViewer) resViewer.textContent = JSON.stringify({ status: "processing...", endpoint: "/v1/ai/project-analysis" }, null, 2);

    box.textContent = "جاري فحص المتطلبات وتحليل الجدوى والمخاطر...";
    if (badge) {
        badge.textContent = "جاري الفحص...";
        badge.className = "badge badge-info";
    }
    if (latency) latency.textContent = "جاري المعالجة...";

    const { data, status, duration } = await WaseetApiClient.call("/v1/ai/project-analysis", "POST", { title, description, budget, deadlineDays, currency: "USD" });

    if (latency) latency.textContent = `اكتمل في: ${duration}ms`;

    if (resViewer) {
        resViewer.textContent = JSON.stringify({
            status,
            durationMs: duration,
            response: data
        }, null, 2);
    }

    if (data && data.success && data.data) {
        const d = data.data;
        box.innerHTML = `
            <div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
                <span class="badge badge-info">وضوح المتطلبات: ${d.clarityScore}%</span>
                <span class="badge ${d.feasibilityScore >= 70 ? "badge-success" : "badge-warning"}">جدوى التنفيذ: ${d.feasibilityScore}%</span>
                <span class="badge">${d.marketFitRating}</span>
            </div>
            <p><strong>الملخص التنفيذي:</strong> ${d.executiveSummary}</p>
            <p><strong>نقاط القوة:</strong> ${d.strengths?.join(" • ") || "لا توجد"}</p>
            <p style="color:var(--console-warning);margin-top:10px;"><strong>المخاطر والثغرات المكتشفة:</strong> ${d.gapsAndRisks?.join(" • ") || "المشروع متكامل"}</p>
        `;
        if (badge) {
            badge.textContent = `اكتمل الفحص (${duration}ms)`;
            badge.className = "badge badge-success";
        }
    } else {
        box.textContent = JSON.stringify(data, null, 2);
        if (badge) {
            badge.textContent = `خطأ (${status})`;
            badge.className = "badge badge-danger";
        }
    }
});

// Draft Suggestion Execution
document.getElementById("runDraftBtn")?.addEventListener("click", async () => {
    const specialtyName = document.getElementById("draftSpecialtyInput")?.value || "تطوير تطبيقات الهواتف الذكية";
    const description = document.getElementById("draftPromptInput")?.value || "";
    const box = document.getElementById("draftOutputBox");
    const badge = document.getElementById("draftBadge");
    const latency = document.getElementById("draftLatencyIndicator");
    const reqViewer = document.getElementById("draftReqViewer");
    const resViewer = document.getElementById("draftResViewer");

    const reqPayload = {
        endpoint: "/v1/ai/request-draft",
        method: "POST",
        headers: {
            "Authorization": "Bearer waseet_secret_dev_key_2026",
            "Content-Type": "application/json"
        },
        body: { title: "فكرة مشروع", description, specialtyName, currency: "USD" },
        timestamp: new Date().toISOString()
    };
    if (reqViewer) reqViewer.textContent = JSON.stringify(reqPayload, null, 2);
    if (resViewer) resViewer.textContent = JSON.stringify({ status: "processing...", endpoint: "/v1/ai/request-draft" }, null, 2);

    box.textContent = "جاري صياغة العنوان والمسودة وتحديد نطاق الميزانية...";
    if (badge) {
        badge.textContent = "جاري الاقتراح...";
        badge.className = "badge badge-info";
    }
    if (latency) latency.textContent = "جاري المعالجة...";

    const { data, status, duration } = await WaseetApiClient.call("/v1/ai/request-draft", "POST", { title: "فكرة مشروع", description, specialtyName, currency: "USD" });

    if (latency) latency.textContent = `اكتمل في: ${duration}ms`;

    if (resViewer) {
        resViewer.textContent = JSON.stringify({
            status,
            durationMs: duration,
            response: data
        }, null, 2);
    }

    if (data && data.success && data.data) {
        const d = data.data;
        box.innerHTML = `
            <div style="padding:16px;background:var(--console-surface);border-radius:8px;border:1px solid var(--console-divider);">
                <h3 style="color:hsl(218, 95%, 82%);margin-bottom:8px;">${d.suggestedTitle}</h3>
                <p style="margin-bottom:12px;">${d.suggestedDescription}</p>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <span class="badge badge-success">الميزانية التقديرية: $${d.recommendedMinBudget} - $${d.recommendedMaxBudget}</span>
                    <span class="badge badge-info">المدة الواقعية: ${d.suggestedDurationDays} يوم</span>
                </div>
            </div>
        `;
        if (badge) {
            badge.textContent = `جاهز للاستخدام (${duration}ms)`;
            badge.className = "badge badge-success";
        }
    } else {
        box.textContent = JSON.stringify(data, null, 2);
        if (badge) {
            badge.textContent = `خطأ (${status})`;
            badge.className = "badge badge-danger";
        }
    }
});

// Assessments Execution
const questionCountInput = document.getElementById("questionCountInput");
const generateExamBtn = document.getElementById("generateExamBtn");
function updateExamBtnText() {
    const count = Number(questionCountInput?.value) || 20;
    if (generateExamBtn) {
        generateExamBtn.textContent = `بدء توليد الاختبار التخصصي (${count} ${count <= 10 && count >= 3 ? "أسئلة" : "سؤال"})`;
    }
}
questionCountInput?.addEventListener("input", updateExamBtnText);
updateExamBtnText();

generateExamBtn?.addEventListener("click", async () => {
    const specialtyName = document.getElementById("assessmentSpecialtyInput").value;
    const questionCount = Number(document.getElementById("questionCountInput").value);
    const container = document.getElementById("examQuestionsContainer");
    const badge = document.getElementById("examAttemptBadge");
    const latency = document.getElementById("examLatencyIndicator");
    const reqViewer = document.getElementById("examReqViewer");
    const resViewer = document.getElementById("examResViewer");

    const reqPayload = {
        endpoint: "/v1/ai/assessments",
        method: "POST",
        headers: {
            "Authorization": "Bearer waseet_secret_dev_key_2026",
            "Content-Type": "application/json"
        },
        body: {
            providerSpecialtyId: "spec-auto-test",
            specialtyName,
            questionCount,
            timeLimitMinutes: 15
        },
        timestamp: new Date().toISOString()
    };
    if (reqViewer) reqViewer.textContent = JSON.stringify(reqPayload, null, 2);
    if (resViewer) resViewer.textContent = JSON.stringify({ status: "generating_exam...", endpoint: "/v1/ai/assessments" }, null, 2);

    container.innerHTML = `جاري إنشاء وتجهيز ${questionCount} سؤال تقني تخصصي حقيقي وفصل مفاتيح الإجابة بالذكاء الاصطناعي...`;
    if (badge) {
        badge.textContent = "جاري التوليد...";
        badge.className = "badge badge-info";
    }
    if (latency) latency.textContent = "جاري المعالجة...";

    const { data, status, duration } = await WaseetApiClient.call("/v1/ai/assessments", "POST", {
        providerSpecialtyId: "spec-auto-test", specialtyName, questionCount, timeLimitMinutes: 15,
    });

    if (latency) latency.textContent = `اكتمل في: ${duration}ms`;

    if (resViewer) {
        resViewer.textContent = JSON.stringify({
            status,
            durationMs: duration,
            response: data
        }, null, 2);
    }

    if (data.success && data.data) {
        state.currentAttemptId = data.data.attemptId;
        state.selectedAnswers = {};
        if (badge) {
            badge.textContent = `Attempt: ${data.data.attemptId.slice(0, 8)}... (${duration}ms)`;
            badge.className = "badge badge-info";
        }

        let html = `<div><p>تم تجهيز <strong>${data.data.questions.length} سؤال</strong> بنجاح. أجب ثم اضغط تصحيح:</p></div>`;
        data.data.questions.forEach((q, idx) => {
            html += `
                <div class="exam-question-item">
                    <div class="exam-question-text">${idx + 1}. ${q.textAr}</div>
                    ${q.options.map((opt) => `
                        <label class="exam-option-item">
                            <input type="radio" name="q_${q.id}" value="${opt.id}" data-qid="${q.id}" data-opt="${opt.id}">
                            <span>${opt.text ?? opt.textAr}</span>
                        </label>
                    `).join("")}
                </div>
            `;
        });
        html += `<button class="btn btn-primary" id="submitExamBtn" style="margin-top:16px;width:100%">إرسال الإجابات والتصحيح الحتمي الفوري</button>`;
        container.innerHTML = html;

        container.querySelectorAll('input[type="radio"]').forEach((r) => {
            r.addEventListener("change", (e) => {
                state.selectedAnswers[e.target.dataset.qid] = e.target.dataset.opt;
            });
        });

        document.getElementById("submitExamBtn")?.addEventListener("click", submitExam);
    } else {
        container.textContent = JSON.stringify(data, null, 2);
        if (badge) {
            badge.textContent = `خطأ (${status})`;
            badge.className = "badge badge-danger";
        }
    }
});

async function submitExam() {
    const container = document.getElementById("examQuestionsContainer");
    const badge = document.getElementById("examAttemptBadge");
    const latency = document.getElementById("examLatencyIndicator");
    const reqViewer = document.getElementById("examReqViewer");
    const resViewer = document.getElementById("examResViewer");

    const reqPayload = {
        endpoint: `/v1/ai/assessments/${state.currentAttemptId}/submit`,
        method: "POST",
        headers: {
            "Authorization": "Bearer waseet_secret_dev_key_2026",
            "Content-Type": "application/json"
        },
        body: {
            submittedAnswers: state.selectedAnswers,
            timeSpentSeconds: 120
        },
        timestamp: new Date().toISOString()
    };
    if (reqViewer) reqViewer.textContent = JSON.stringify(reqPayload, null, 2);
    if (resViewer) resViewer.textContent = JSON.stringify({ status: "grading...", endpoint: `/v1/ai/assessments/${state.currentAttemptId}/submit` }, null, 2);

    container.innerHTML = "جاري التصحيح الحتمي 100% في السيرفر وتوليد تقرير الأداء الفني...";
    if (badge) {
        badge.textContent = "جاري التصحيح...";
        badge.className = "badge badge-info";
    }
    if (latency) latency.textContent = "جاري الحساب...";

    const { data, status, duration } = await WaseetApiClient.call(`/v1/ai/assessments/${state.currentAttemptId}/submit`, "POST", {
        submittedAnswers: state.selectedAnswers, timeSpentSeconds: 120,
    });

    if (latency) latency.textContent = `اكتمل في: ${duration}ms`;

    if (resViewer) {
        resViewer.textContent = JSON.stringify({
            status,
            durationMs: duration,
            response: data
        }, null, 2);
    }

    if (data.success && data.data) {
        const d = data.data;
        if (badge) {
            badge.textContent = `${d.score}% ${d.isPassed ? "مؤهل ✓" : "راسب ✕"} (${duration}ms)`;
            badge.className = `badge ${d.isPassed ? "badge-success" : "badge-danger"}`;
        }
        container.innerHTML = `
            <div style="padding:16px;background:var(--console-surface);border-radius:8px;border:1px solid var(--console-divider)">
                <h3>النتيجة: <span class="badge ${d.isPassed ? "badge-success" : "badge-danger"}">${d.score}% - ${d.isPassed ? "ناجح ومؤهل" : "لم يجتز"}</span></h3>
                <p style="margin:12px 0;"><strong>التقييم الفني:</strong> ${d.feedbackAr}</p>
                <p><strong>نقاط القوة:</strong> ${d.strengths?.join(" • ") || "لا توجد"}</p>
                <p style="color:var(--console-warning)"><strong>نقاط التحسين:</strong> ${d.weaknesses?.join(" • ") || "ممتاز"}</p>
            </div>
        `;
    } else {
        container.textContent = JSON.stringify(data, null, 2);
    }
}

// Proposals Execution
document.getElementById("runProposalActionBtn")?.addEventListener("click", async () => {
    const action = document.getElementById("proposalActionSelect").value;
    const message = document.getElementById("proposalMessageInput").value;
    const box = document.getElementById("proposalOutputBox");
    const badge = document.getElementById("proposalBadge");
    const latency = document.getElementById("proposalLatencyIndicator");
    const reqViewer = document.getElementById("propReqViewer");
    const resViewer = document.getElementById("propResViewer");

    box.textContent = "جاري الفحص والمطابقة...";
    if (badge) {
        badge.textContent = "جاري المعالجة...";
        badge.className = "badge badge-info";
    }
    if (latency) latency.textContent = "جاري المعالجة...";

    let ep = "/v1/ai/proposals/enrich";
    let body = {};

    if (action === "enrich") {
        ep = "/v1/ai/proposals/enrich";
        body = {
            projectId: "proj-101",
            title: "تطوير متجر وسيط إلكتروني",
            message: message || "خبرة 5 سنوات في React و Next.js، قمت بتنفيذ 12 متجر وسأسلم المشروع بكود نظيف.",
            totalPrice: 2500,
            deliveryDays: 14
        };
    } else if (action === "suggest") {
        ep = "/v1/ai/proposals/suggest";
        body = {
            projectId: "proj-101",
            currentTitle: "عرض تطوير المنصة الاحترافي",
            currentMessage: message || "أستطيع تنفيذ المشروع وتسليمه في الوقت المحدد مع ضمان الجودة.",
            currency: "USD"
        };
    } else if (action === "matching") {
        ep = "/v1/ai/matching/projects-for-provider";
        body = {
            providerId: "prov-expert-01",
            limit: 5,
            specialtyFilter: "تطوير ويب"
        };
    } else if (action === "fit") {
        ep = "/v1/ai/project-fit";
        body = {
            projectId: "proj-101",
            currency: "USD",
            providerSpecialty: "تطوير واجهات React & TypeScript",
            providerRate: 45
        };
    } else if (action === "metrics") {
        ep = "/v1/ai/profile/performance-summary";
        body = {
            providerId: "prov-expert-01",
            totalProjectsCompleted: 15,
            onTimeProjectsCount: 14,
            repeatClientsCount: 5,
            totalClientsCount: 12,
            fiveStarReviewsCount: 14,
            totalReviewsCount: 15,
            disputedProjectsCount: 0
        };
    }

    const reqPayload = {
        endpoint: ep,
        method: "POST",
        headers: {
            "Authorization": "Bearer waseet_secret_dev_key_2026",
            "Content-Type": "application/json"
        },
        body,
        timestamp: new Date().toISOString()
    };
    if (reqViewer) reqViewer.textContent = JSON.stringify(reqPayload, null, 2);
    if (resViewer) resViewer.textContent = JSON.stringify({ status: "processing...", endpoint: ep }, null, 2);

    const { data, status, duration } = await WaseetApiClient.call(ep, "POST", body);

    if (latency) latency.textContent = `اكتمل في: ${duration}ms`;

    if (resViewer) {
        resViewer.textContent = JSON.stringify({
            status,
            durationMs: duration,
            response: data
        }, null, 2);
    }

    if (data.success && data.data) {
        if (badge) {
            badge.textContent = `ناجح (${duration}ms)`;
            badge.className = "badge badge-success";
        }

        const d = data.data;
        if (action === "enrich") {
            box.innerHTML = `
                <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
                    <span class="badge badge-success">نسبة المطابقة: ${d.aiMatchScore}%</span>
                    <span class="badge badge-info">جودة العرض: ${d.aiQualityTag}</span>
                    <span class="badge badge-warning">تقييم السعر: ${d.aiPriceTag}</span>
                </div>
                <p><strong>ملخص الفحص الفني:</strong> ${d.aiFeedback?.summary || "تم تدقيق العرض ومطابقته للشروط بنجاح"}</p>
            `;
        } else if (action === "suggest") {
            box.innerHTML = `
                <div style="padding:14px;background:var(--console-surface);border-radius:6px;border:1px solid var(--console-divider);">
                    <div style="display:flex;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
                        <span class="badge badge-success">نقاط الجودة: ${d.qualityScore}% (${d.qualityTag})</span>
                        <span class="badge badge-info">السعر العادل: $${d.priceAudit?.recommendedMin} - $${d.priceAudit?.recommendedMax}</span>
                    </div>
                    <h4 style="color:hsl(218, 95%, 82%);margin-bottom:8px;">العنوان المقترح: ${d.suggestedTitle}</h4>
                    <p style="margin-bottom:12px;"><strong>نص العرض المحسّن:</strong> ${d.suggestedMessage}</p>
                    <p><strong>المزايا التنافسية المقترحة:</strong> ${d.suggestedAdvantages?.join(" • ") || "لا توجد"}</p>
                </div>
            `;
        } else if (action === "matching") {
            box.innerHTML = `
                <div style="margin-bottom:12px;"><span class="badge badge-success">تقييم المطابقة الكلي: ${d.summary?.aiRating}%</span></div>
                ${d.aiMatchingProjects?.map(p => `
                    <div style="padding:10px 14px;margin-bottom:8px;background:var(--console-surface);border-radius:6px;border:1px solid var(--console-divider);">
                        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                            <strong>مشروع: ${p.projectId}</strong>
                            <span class="badge badge-info">توافق: ${p.aiMatchScore}%</span>
                        </div>
                        <p style="font-size:0.85rem;color:var(--console-text-muted);">${p.matchReasons?.join(" • ")}</p>
                    </div>
                `).join("") || "<p>لا توجد مشاريع مطابقة حالياً</p>"}
            `;
        } else if (action === "fit") {
            box.innerHTML = `
                <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
                    <span class="badge badge-success">نسبة الملاءمة: ${d.matchPercent}%</span>
                    <span class="badge badge-info">السعر المقترح للتنافس: $${d.suggestedBidPrice}</span>
                </div>
                <p><strong>تحليل التوافق:</strong> ${d.matchSummary}</p>
                <p style="margin-top:8px;"><strong>استراتيجية الفوز بالعقد:</strong> ${d.winningStrategy?.join(" • ") || "تقديم عرض مفصل"}</p>
                <p style="color:var(--console-warning);margin-top:8px;"><strong>تقييم المخاطر:</strong> ${d.riskAssessment || "لا توجد مخاطر معتبرة"}</p>
            `;
        } else if (action === "metrics") {
            box.innerHTML = `
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:10px;">
                    <div style="padding:10px;background:var(--console-surface);border-radius:6px;border:1px solid var(--console-divider);text-align:center;">
                        <div style="font-size:0.75rem;color:var(--console-text-muted);">جودة التنفيذ</div>
                        <div style="font-size:1.2rem;font-weight:700;color:var(--console-success);">${d.executionQuality}%</div>
                    </div>
                    <div style="padding:10px;background:var(--console-surface);border-radius:6px;border:1px solid var(--console-divider);text-align:center;">
                        <div style="font-size:0.75rem;color:var(--console-text-muted);">التسليم في الموعد</div>
                        <div style="font-size:1.2rem;font-weight:700;color:var(--console-primary);">${d.onTimeDelivery}%</div>
                    </div>
                    <div style="padding:10px;background:var(--console-surface);border-radius:6px;border:1px solid var(--console-divider);text-align:center;">
                        <div style="font-size:0.75rem;color:var(--console-text-muted);">رضا العملاء</div>
                        <div style="font-size:1.2rem;font-weight:700;color:hsl(42, 98%, 70%);">${d.clientSatisfaction}%</div>
                    </div>
                    <div style="padding:10px;background:var(--console-surface);border-radius:6px;border:1px solid var(--console-divider);text-align:center;">
                        <div style="font-size:0.75rem;color:var(--console-text-muted);">عملاء متكررون</div>
                        <div style="font-size:1.2rem;font-weight:700;color:hsl(280, 80%, 75%);">${d.repeatClientRate}%</div>
                    </div>
                    <div style="padding:10px;background:var(--console-surface);border-radius:6px;border:1px solid var(--console-divider);text-align:center;">
                        <div style="font-size:0.75rem;color:var(--console-text-muted);">خدمات بلا نزاع</div>
                        <div style="font-size:1.2rem;font-weight:700;color:var(--console-success);">${d.conflictFreeDeliveryRate}%</div>
                    </div>
                </div>
            `;
        }
    } else {
        box.textContent = JSON.stringify(data, null, 2);
        if (badge) {
            badge.textContent = `خطأ (${status})`;
            badge.className = "badge badge-danger";
        }
    }
});

// Disputes Execution
document.getElementById("runDisputeBtn")?.addEventListener("click", async () => {
    const clientClaim = document.getElementById("disputeClientClaim").value;
    const providerClaim = document.getElementById("disputeProviderClaim").value;
    const box = document.getElementById("disputeOutputBox");
    const badge = document.getElementById("disputeBadge");
    const latency = document.getElementById("disputeLatencyIndicator");
    const reqViewer = document.getElementById("dispReqViewer");
    const resViewer = document.getElementById("dispResViewer");

    const reqPayload = {
        endpoint: "/v1/ai/disputes/summary",
        method: "POST",
        headers: {
            "Authorization": "Bearer waseet_secret_dev_key_2026",
            "Content-Type": "application/json"
        },
        body: {
            disputeId: "disp-1",
            projectId: "proj-1",
            clientClaim,
            providerClaim,
            evidenceList: ["ملفات التسليم", "سجل التعديلات"]
        },
        timestamp: new Date().toISOString()
    };
    if (reqViewer) reqViewer.textContent = JSON.stringify(reqPayload, null, 2);
    if (resViewer) resViewer.textContent = JSON.stringify({ status: "processing...", endpoint: "/v1/ai/disputes/summary" }, null, 2);

    box.textContent = "جاري التوجيه للمشروع المدفوع وتوليد تقرير النزاع المحايد...";
    if (badge) {
        badge.textContent = "جاري التوليد...";
        badge.className = "badge badge-info";
    }
    if (latency) latency.textContent = "جاري المعالجة...";

    const { data, status, duration } = await WaseetApiClient.call("/v1/ai/disputes/summary", "POST", {
        disputeId: "disp-1", projectId: "proj-1", clientClaim, providerClaim, evidenceList: ["ملفات التسليم", "سجل التعديلات"],
    });

    if (latency) latency.textContent = `اكتمل في: ${duration}ms`;

    if (resViewer) {
        resViewer.textContent = JSON.stringify({
            status,
            durationMs: duration,
            response: data
        }, null, 2);
    }

    if (data.success && data.data) {
        const d = data.data;
        if (badge) {
            badge.textContent = `تقرير معتمد (${duration}ms)`;
            badge.className = "badge badge-success";
        }
        const md = `### ⚖️ ملخص النزاع القانوني\n${d.summary}\n\n### 👤 منظور العميل\n${d.clientPerspective}\n\n### 🛠️ منظور المنفذ\n${d.providerPerspective}\n\n---\n### 💡 التوصية والحل القضائي المقترح\n${d.recommendation || d.suggestedResolution || "توصية تسوية ودية"}`;
        box.innerHTML = renderMarkdown(md);
    } else {
        box.textContent = JSON.stringify(data, null, 2);
        if (badge) {
            badge.textContent = `خطأ (${status})`;
            badge.className = "badge badge-danger";
        }
    }
});

// Help & Avatar Execution
document.getElementById("askHelpBtn")?.addEventListener("click", async () => {
    const question = document.getElementById("helpQuestionInput").value;
    const box = document.getElementById("helpOutputBox");
    const badge = document.getElementById("fallbackBadge");
    const latency = document.getElementById("helpLatencyIndicator");
    const reqViewer = document.getElementById("helpReqViewer");
    const resViewer = document.getElementById("helpResViewer");

    const reqPayload = {
        endpoint: "/v1/ai/help/chat",
        method: "POST",
        headers: {
            "Authorization": "Bearer waseet_secret_dev_key_2026",
            "Content-Type": "application/json"
        },
        body: { question },
        protocol: "Server-Sent Events (SSE)",
        timestamp: new Date().toISOString()
    };
    if (reqViewer) reqViewer.textContent = JSON.stringify(reqPayload, null, 2);
    if (resViewer) resViewer.textContent = JSON.stringify({ status: "connecting...", endpoint: "/v1/ai/help/chat" }, null, 2);

    box.textContent = "";
    if (badge) {
        badge.textContent = "جاري البحث بالـ RAG...";
        badge.className = "badge badge-info";
    }
    if (latency) latency.textContent = "جاري الاستقبال...";

    const t0 = Date.now();
    let helpAccum = "";
    let citationsList = [];
    let isFallbackTriggered = false;

    await WaseetApiClient.streamHelp(
        question,
        (chunk) => {
            helpAccum += chunk;
            box.innerHTML = renderMarkdown(helpAccum);
            if (resViewer) {
                resViewer.textContent = JSON.stringify({
                    status: "streaming",
                    bytesReceived: helpAccum.length,
                    elapsedMs: Date.now() - t0,
                }, null, 2);
            }
        },
        (cits) => {
            citationsList = cits;
            if (badge) {
                badge.textContent = `${cits.length} وثائق معتمدة`;
                badge.className = "badge badge-success";
            }
        },
        () => {
            isFallbackTriggered = true;
            if (badge) {
                badge.textContent = "تحويل للدعم البشري";
                badge.className = "badge badge-danger";
            }
            box.innerHTML += `<div style="margin-top:12px;color:var(--console-danger);font-weight:600;">[تنبيه: تفعيل التحويل للدعم البشري لعدم توفر وثيقة مطابقة]</div>`;
        },
        () => {
            const totalMs = Date.now() - t0;
            if (latency) latency.textContent = `اكتمل في: ${totalMs}ms`;
            if (resViewer) {
                resViewer.textContent = JSON.stringify({
                    status: "completed",
                    protocol: "Server-Sent Events (SSE)",
                    durationMs: totalMs,
                    citationsCount: citationsList.length,
                    citations: citationsList,
                    humanSupportFallback: isFallbackTriggered,
                    totalLength: helpAccum.length,
                    completedAt: new Date().toISOString()
                }, null, 2);
            }
        }
    );
});

// Copy Output to Clipboard with Toast Feedback
dom.copyBtn?.addEventListener("click", async () => {
    const textToCopy = state.lastGeneratedRawMarkdown || dom.streamBox.innerText;
    if (!textToCopy) return;

    try {
        await navigator.clipboard.writeText(textToCopy);
    } catch {
        const ta = document.createElement("textarea");
        ta.value = textToCopy;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
    }

    if (dom.copyBtnText) {
        const originalText = dom.copyBtnText.textContent;
        dom.copyBtnText.textContent = "تم النسخ! ✓";
        dom.copyBtn.style.background = "var(--console-success)";
        dom.copyBtn.style.color = "hsl(0, 0%, 10%)";
        setTimeout(() => {
            dom.copyBtnText.textContent = originalText;
            dom.copyBtn.style.background = "";
            dom.copyBtn.style.color = "";
        }, 2000);
    }
});

// Quick Dialect Preset Buttons
document.querySelectorAll(".tts-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        const preset = btn.getAttribute("data-preset");
        const dialectSelect = document.getElementById("ttsDialectSelect");
        const textInput = document.getElementById("ttsTextInput");
        if (dialectSelect && preset) dialectSelect.value = preset;

        const presetTexts = {
            egyptian: "يا أهلاً بيك يا فندم في منصة وسيط! إحنا هنا علشان نضمنلك كل مليم في مشروعك ونسلملك الشغل على الفرازة مع نظام الدفع المشروط الذكي.",
            gulf: "يا هلا والله ومسهلا فيكم بمنصة وسيط، نسعد بخدمتكم وتوفير أفضل الكفاءات لتنفيذ مشاريعكم بكل ثقة وأمان.",
            saudi: "حياكم الله في منصة وسيط للعمل الحر، نضمن حقوقكم خطوة بخطوة مع نخبة من الخبراء والمستقلين المعتمدين.",
            msa: "أهلاً وسهلاً بك في منصة وسيط للعمل الحر، حيث تلتقي الكفاءة والاحترافية مع نظام الضمان المالي المتقدم.",
            english: "Welcome to Waseet platform, where elite freelance talent meets intelligent escrow and milestone delivery.",
        };
        if (textInput && presetTexts[preset]) {
            textInput.value = presetTexts[preset];
        }
    });
});

// Run TTS Audio Synthesis
document.getElementById("runTtsBtn")?.addEventListener("click", async () => {
    const text = document.getElementById("ttsTextInput")?.value?.trim() || "مرحباً بكم في منصة وسيط للعمل الحر";
    const model = document.getElementById("ttsModelSelect")?.value || "AUTO";
    const dialect = document.getElementById("ttsDialectSelect")?.value || "egyptian";
    const voice = document.getElementById("ttsVoiceSelect")?.value || "Puck";
    const rate = document.getElementById("ttsRateSelect")?.value || "normal";

    const box = document.getElementById("helpOutputBox");
    const badge = document.getElementById("ttsBadge");
    const latency = document.getElementById("ttsLatencyIndicator");
    const reqViewer = document.getElementById("helpReqViewer");
    const resViewer = document.getElementById("helpResViewer");
    const player = document.getElementById("ttsAudioPlayer");
    const downloadBtn = document.getElementById("ttsDownloadBtn");
    const placeholder = document.getElementById("ttsPlaceholderText");
    const statusTitle = document.getElementById("ttsAudioStatusTitle");

    const reqPayload = {
        endpoint: "/v1/ai/tts/synthesize",
        method: "POST",
        headers: {
            "Authorization": "Bearer waseet_secret_dev_key_2026",
            "Content-Type": "application/json"
        },
        body: { text, model, dialect, voice, speakingRate: rate },
        timestamp: new Date().toISOString()
    };
    if (reqViewer) reqViewer.textContent = JSON.stringify(sanitizeAiBranding(reqPayload), null, 2);
    if (resViewer) resViewer.textContent = JSON.stringify(sanitizeAiBranding({ status: "generating_audio...", model, dialect, voice }), null, 2);

    if (badge) {
        badge.textContent = "جاري توليد النطق...";
        badge.className = "badge badge-info";
    }
    if (latency) latency.textContent = "توليد الصوت...";
    if (box) box.textContent = `جاري استدعاء محرك الصوت الذكي (Waseet Voice Engine) لتوليد النطق بلهجة (${dialect}) وبصوت (${voice})...`;

    const { data, status, duration } = await WaseetApiClient.synthesizeSpeech(text, {
        model, voice, dialect, speakingRate: rate
    });

    if (latency) latency.textContent = `اكتمل في: ${duration}ms`;

    if (resViewer) {
        resViewer.textContent = JSON.stringify(sanitizeAiBranding({
            status,
            durationMs: duration,
            response: data
        }), null, 2);
    }

    if (data.success && data.data?.audio?.base64Audio) {
        const audioData = data.data.audio;
        const meta = data.data.metadata;
        if (badge) {
            badge.textContent = `${sanitizeAiBranding(meta.modelUsed)} (${duration}ms)`;
            badge.className = "badge badge-success";
        }
        if (box) {
            box.innerHTML = `
                <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
                    <span class="badge badge-success">المحرك: ${sanitizeAiBranding(meta.modelUsed)}</span>
                    <span class="badge badge-info">الصوت: ${meta.voice}</span>
                    <span class="badge badge-primary">اللهجة: ${meta.dialect}</span>
                    <span class="badge">السيرفر: Waseet Cloud Cluster</span>
                    <span class="badge">الحجم: ${Math.round(audioData.sizeBytes / 1024)} KB</span>
                </div>
                <p><strong>النص المنطوق:</strong> "${text}"</p>
            `;
        }

        if (player) {
            const audioSrc = `data:${audioData.mimeType};base64,${audioData.base64Audio}`;
            player.src = audioSrc;
            player.style.display = "block";
            player.play().catch(() => {});
            if (placeholder) placeholder.style.display = "none";
            if (statusTitle) statusTitle.textContent = `المشغل الصوتي (${meta.voice} - ${meta.dialect}):`;
            if (downloadBtn) {
                downloadBtn.href = audioSrc;
                downloadBtn.style.display = "inline-flex";
            }
        }
    } else {
        if (badge) {
            badge.textContent = `خطأ (${status})`;
            badge.className = "badge badge-danger";
        }
        if (box) box.textContent = JSON.stringify(sanitizeAiBranding(data), null, 2);
    }
});

// Avatar Voice Chat
document.getElementById("askAvatarBtn")?.addEventListener("click", async () => {
    const message = document.getElementById("ttsTextInput")?.value?.trim() || "كيف أضمن استلام مشروعي بدون مشاكل؟";
    const box = document.getElementById("helpOutputBox");
    const badge = document.getElementById("ttsBadge");
    const latency = document.getElementById("ttsLatencyIndicator");
    const reqViewer = document.getElementById("helpReqViewer");
    const resViewer = document.getElementById("helpResViewer");
    const player = document.getElementById("ttsAudioPlayer");
    const downloadBtn = document.getElementById("ttsDownloadBtn");
    const placeholder = document.getElementById("ttsPlaceholderText");
    const statusTitle = document.getElementById("ttsAudioStatusTitle");

    const reqPayload = {
        endpoint: "/v1/ai/avatar/chat",
        method: "POST",
        headers: {
            "Authorization": "Bearer waseet_secret_dev_key_2026",
            "Content-Type": "application/json"
        },
        body: { message },
        timestamp: new Date().toISOString()
    };
    if (reqViewer) reqViewer.textContent = JSON.stringify(sanitizeAiBranding(reqPayload), null, 2);
    if (resViewer) resViewer.textContent = JSON.stringify(sanitizeAiBranding({ status: "avatar_chat_speaking...", endpoint: "/v1/ai/avatar/chat" }), null, 2);

    if (box) box.textContent = "جاري تفكير الأفاتار وتوليد الرد الصوتي لايف...";
    if (badge) {
        badge.textContent = "توليد الرد والصوت...";
        badge.className = "badge badge-info";
    }
    if (latency) latency.textContent = "جاري المعالجة...";

    const { data, status, duration } = await WaseetApiClient.call("/v1/ai/avatar/chat", "POST", { message });

    if (latency) latency.textContent = `اكتمل في: ${duration}ms`;

    if (resViewer) {
        resViewer.textContent = JSON.stringify(sanitizeAiBranding({
            status,
            durationMs: duration,
            response: data
        }), null, 2);
    }

    if (data.success && data.data) {
        if (badge) {
            badge.textContent = `أفاتار ناطق (${duration}ms)`;
            badge.className = "badge badge-success";
        }
        if (box) {
            box.innerHTML = `
                <div style="margin-bottom:8px;"><span class="badge badge-success">رد الأفاتار الذكي</span></div>
                <p style="font-size:1.05rem;line-height:1.6;">${data.data.text}</p>
            `;
        }

        if (data.data.audio?.base64Audio && player) {
            const audioSrc = `data:${data.data.audio.mimeType || "audio/wav"};base64,${data.data.audio.base64Audio}`;
            player.src = audioSrc;
            player.style.display = "block";
            player.play().catch(() => {});
            if (placeholder) placeholder.style.display = "none";
            if (statusTitle) statusTitle.textContent = "صوت الأفاتار الذكي (Waseet Voice):";
            if (downloadBtn) {
                downloadBtn.href = audioSrc;
                downloadBtn.style.display = "inline-flex";
            }
        }
    } else {
        if (box) box.textContent = JSON.stringify(sanitizeAiBranding(data), null, 2);
        if (badge) {
            badge.textContent = `خطأ (${status})`;
            badge.className = "badge badge-danger";
        }
    }
});
document.getElementById("livePingBtn")?.addEventListener("click", async () => {
    try {
        const h = await WaseetApiClient.checkHealth();
        document.getElementById("pingBadge").textContent = "200 OK";
        alert(`السيرفر يعمل بكفاءة:\nالحالة: ${h.status}\nالوقت: ${h.timestamp}`);
    } catch {
        document.getElementById("pingBadge").textContent = "ERR";
    }
});

document.getElementById("presetBtn")?.addEventListener("click", () => {
    document.getElementById("projectTitleInput").value = "منصة وسيط للعمل الحر (Waseet Freelance Platform)";
    document.getElementById("projectBudgetInput").value = "4500";
    document.getElementById("projectDurationInput").value = "30";
    document.getElementById("projectPromptInput").value = "تطبيق متكامل لربط العملاء بالمنفذين مع نظام دفع ومراحل تسليم وتدقيق عروض بالذكاء الاصطناعي.";
});

// 31-Feature Live Search in Sidebar
const featureSearchInput = document.getElementById("featureSearch");
featureSearchInput?.addEventListener("input", (e) => {
    const term = (e.target.value || "").trim().toLowerCase();
    document.querySelectorAll(".sidebar-nav .nav-link").forEach((link) => {
        if (!term) {
            link.style.display = "flex";
            return;
        }
        const text = (link.innerText || "").toLowerCase();
        const tab = link.getAttribute("data-tab") || "";
        const matches = text.includes(term) || tab.includes(term);
        link.style.display = matches ? "flex" : "none";
    });
});

// Run initial route based on URL hash
routeFromHash();
