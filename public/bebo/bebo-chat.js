/* Generated from the original Bebo UI; browser contains no service credentials. */
(()=>{

const DIALECTS = {
  egyptian:{label:'مصري',language:'ar-EG',prompt:'العامية المصرية الطبيعية'},
  saudi:{label:'سعودي',language:'ar-SA',prompt:'اللهجة السعودية الطبيعية'},
  gulf:{label:'خليجي',language:'ar-KW',prompt:'اللهجة الخليجية الطبيعية'},
  msa:{label:'فصحى',language:'ar-SA',prompt:'العربية الفصحى المعاصرة'},
  english:{label:'English',language:'en-US',prompt:'natural English'}
};
const ACTIONS = new Set(['jump','walk','wave','happy','typing','rest','sleep','idle','reset','stop','roam_on','roam_off','scratch','dance','fly','laugh','cry','plead','chase']);
function normalize(text){
  return String(text||'').toLowerCase().replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
}
function chooseDialect(text,requested='auto',previous='egyptian'){
  if(Object.hasOwn(DIALECTS,requested))return {dialect:requested,source:'selected'};
  const t=normalize(text);
  const latin=(t.match(/[a-z]/g)||[]).length,arabic=(t.match(/[\u0600-\u06ff]/g)||[]).length;
  if(latin>4&&latin>arabic*1.5)return {dialect:'english',source:'detected'};
  const tokens=new Set(t.split(' '));
  const vocab={
    egyptian:['ايه','ليه','كدة','ده','دي','ازيك','عايز','عاوزه','عايزة','ازاي','كده','دلوقتي','بص','بتاع','يلا','عامل','انط','امشي'],
    saudi:['وش','ابغي','ابي','الحين','كيفك','حياك','تبي','تقدر','عساك'],
    gulf:['شلونك','شلون','وايد','هلا','هني','شخبارك','شنو','زين','جذي'],
    msa:['اريد','كيف','مرحبا','يمكنني','استطيع','رجاء','يرجي','اشرح']
  };
  const scores=Object.entries(vocab).map(([id,words])=>[id,words.filter(w=>tokens.has(w)).length]).sort((a,b)=>b[1]-a[1]);
  if(scores[0][1]>0&&scores[0][1]>(scores[1]?.[1]||0))return {dialect:scores[0][0],source:'detected'};
  return {dialect:Object.hasOwn(DIALECTS,previous)?previous:'egyptian',source:'previous'};
}
function commandFor(text){
  let t=normalize(text).replace(/^(يا\s+)?(بيبو|bebo)\s+/,'').replace(/^(من فضلك|لو سمحت|ممكن|please)\s+/,'').trim();
  if(t.length>100||/^(لا|مت|ما|dont|do not|don't)\b/.test(t))return null;
  const groups={
    stop:['اسكت','اخرس','وقف الصوت','اوقف الصوت','كفاية كلام','بس خلاص','stop talking','be quiet','stop'],
    reset:['ارجع مكانك','ارجع لمكانك','ارجع مكانك تاني','reset','go home'],
    roam_on:['اتحرك لوحدك','اتحرك من نفسك','تحرك من نفسك','wander','roam'],
    roam_off:['بطل تتحرك لوحدك','وقف التجول','stop roaming'],
    jump:['انط','نط','اقفز','انط كده','يلا انط','jump','hop'],
    walk:['امشي','اتمشي','تمشي','تحرك','امش','امشي شوية','walk','take a walk'],
    wave:['سلم','سلم عليا','سلم علي','لوح','قول هاي','wave','wave hello'],
    happy:['افرح','احتفل','celebrate','be happy'],
    dance:['ارقص','ارقصلي','ارقص لي','يلا ارقص','dance','dance for me'],
    scratch:['اهرش','هرش','اهرش راسك','هرش راسك','حك راسك','احك راسك','scratch','scratch your head'],
    fly:['دبانة','دبانه','طلع دبانة','طلع دبانه','هات دبانة','هات دبانه','كل الدبانة','كل الدبانه','امسك الدبانة','امسك الدبانه','catch a fly','eat the fly'],
    laugh:['اضحك','اضحك جامد','اضحك اوي','ضحك','ضحكة','ضحكه','هاهاها','laugh','laugh hard'],
    cry:['عيط','عيط جامد','عيط اوي','اعيط','ابكي','ابك','ابكي جامد','cry','cry hard'],
    plead:['صعبنيات','صعبانيات','اعمل صعبنيات','اعمل صعبانيات','اعمل صعبانيات زي القطط','اعمل حركة صعبنيات زي القطط','صعبنيات زي القطط','صعبانيات زي القطط','اعمل عيون قطط','عيون قطط','عيون قطة','عيون قطه','اتدلع','صعب عليا نفسك','beg','puppy eyes','kitten eyes'],
    chase:['اجري ورا القطة','اجري ورا القطه','اجري ورا قطة','اجري ورا قطة بتجري','اجري ورا قطه','اجري وراء القطة','اجري ورا البسة','العب مع القطة','العب مع القطه','طارد القطة','طارد القطه','هات القطة','هات القطه','chase the cat','chase a cat','play with the cat'],
    typing:['افتح اللاب','افتح اللابتوب','امسك اللاب','اكتب','اشتغل','افتح اللاب واكتب','type','start typing'],
    rest:['اقعد','ارتاح','استريح','sit','rest'],
    sleep:['نام','روح نام','sleep'],
    idle:['استني','قف','وقف الحركة','توقف','wait','stand still']
  };
  for(const [action,phrases]of Object.entries(groups))if(phrases.includes(t))return action;
  return null;
}
const acknowledgements={
  egyptian:{laugh:'هاهاها! مش قادر أمسك نفسي!',cry:'دموعي بقت شلّال! هاتوا المناديل!',plead:'طب علشاني أنا؟ بصّ للعيون دي!',chase:'يا بسبس، استنيني! نلعب استغماية؟',scratch:'ثانية، فيه حاجة بتقرّصني!',dance:'على واحدة ونص! شوف الرقصة دي.',fly:'إيه ده؟ دبّانة! تعالي هنا…',jump:'حاضر، نطّة حلوة ليك!',walk:'حاضر، هتمشّى شوية.',wave:'أهلًا بيك! نورتني.',happy:'يا سلام! خلّينا نفرح سوا.',typing:'فتحت اللابتوب، جاهز أشتغل معاك.',rest:'حاضر، استراحة صغيرة.',sleep:'تصبح على خير، هنام شوية.',idle:'حاضر، مستني معاك.',reset:'رجعت لمكاني.',stop:'حاضر، وقّفت الصوت.',roam_on:'تمام، هتحرّك من نفسي شوية.',roam_off:'تمام، وقّفت التجوّل.'},
  saudi:{laugh:'هههه! ما قدرت أمسك ضحكتي!',cry:'دموعي صارت شلّال! وين المناديل؟',plead:'تكفى، شوف هالعيون!',chase:'يا بسبس، انتظريني! خلّنا نلعب.',scratch:'لحظة، أحكّ راسي شوي!',dance:'أبشر، هذي رقصة لك!',fly:'وش هذي؟ ذبابة! خلّني أمسكها.',jump:'أبشر، هذي نطّة لك!',walk:'أبشر، بتمشّى شوي.',wave:'يا هلا والله! حيّاك.',happy:'يا سلام، خلّنا نحتفل!',typing:'أبشر، فتحت اللابتوب وجاهز أشتغل معك.',rest:'تمام، باخذ لي راحة.',sleep:'تصبح على خير.',idle:'أبشر، أنا بانتظارك.',reset:'رجعت مكاني.',stop:'أبشر، وقّفت الصوت.',roam_on:'أبشر، بتحرّك من نفسي شوي.',roam_off:'تمام، وقّفت التجوّل.'},
  gulf:{laugh:'هههه! وايد تضحّك!',cry:'دموعي صارت شلّال! وين المناديل؟',plead:'عشاني أنا، شوف هالعيون!',chase:'يا بسبس، نطريني! خلّنا نلعب.',scratch:'لحظة، بحكّ راسي شوي!',dance:'يلا، خلّنا نرقص شوي!',fly:'شنو هذي؟ ذبابة! بمسكها.',jump:'حاضر، نطّة حلوة لك!',walk:'حاضر، بتمشّى شوي.',wave:'هلا والله! شلونك؟',happy:'وايد حلو، خلّنا نفرح!',typing:'فتحت اللابتوب، جاهز أشتغل وياك.',rest:'حاضر، باخذ راحة شوي.',sleep:'تصبح على خير.',idle:'حاضر، أنا موجود.',reset:'ردّيت مكاني.',stop:'حاضر، وقّفت الصوت.',roam_on:'زين، بتحرّك من نفسي شوي.',roam_off:'حاضر، وقّفت التجوّل.'},
  msa:{laugh:'هاهاها! لا أستطيع التوقف عن الضحك!',cry:'يا لها من دموع! أحتاج منديلًا!',plead:'من أجلي، رجاءً! انظر إلى عينيّ!',chase:'انتظريني أيتها القطة! لنلعب معًا.',scratch:'لحظة، سأحكّ رأسي قليلًا.',dance:'حسنًا، إليك رقصة صغيرة!',fly:'هناك ذبابة! سأحاول الإمساك بها.',jump:'حسنًا، سأقفز الآن.',walk:'حسنًا، سأمشي قليلًا.',wave:'مرحبًا بك! يسعدني لقاؤك.',happy:'رائع، لنحتفل معًا!',typing:'فتحت الحاسوب، وأنا جاهز للعمل معك.',rest:'حسنًا، سأستريح قليلًا.',sleep:'تصبح على خير.',idle:'حسنًا، أنا بانتظارك.',reset:'عدت إلى مكاني.',stop:'حسنًا، أوقفت الصوت.',roam_on:'حسنًا، سأتحرك تلقائيًا.',roam_off:'أوقفت التجوّل التلقائي.'},
  english:{laugh:'Hahaha! I cannot stop giggling!',cry:'Oh no, cartoon waterfalls! Tissues, please!',plead:'Pretty please? Look at these kitten eyes!',chase:'Wait for me, kitty! Let us play.',scratch:'One second, a little head scratch!',dance:'Here comes my little dance!',fly:'A fly! Let me catch it.',jump:'Sure! Here comes a little jump.',walk:'Sure, I will take a short walk.',wave:'Hello there! Good to see you.',happy:'Wonderful! Let us celebrate.',typing:'Laptop open. Ready to work with you!',rest:'Time for a little break.',sleep:'Good night!',idle:'Sure, I am here when you need me.',reset:'Back in my spot.',stop:'Okay, audio stopped.',roam_on:'Sure, I will wander around a little.',roam_off:'Automatic wandering is off.'}
};
function acknowledge(action,dialect){return acknowledgements[dialect]?.[action]||acknowledgements.egyptian[action]||'';}
function makePrompt(message,history,dialect){
  const language=DIALECTS[dialect]?.prompt||DIALECTS.egyptian.prompt;
  return 'أنت بيبو Bebo، روبوت لطيف ومساعد لمنصة وسيط. رد بلغة أو لهجة '+language+
  '. أجب دائمًا باختصار شديد: جملة واحدة أو جملتان قصيرتان بحد أقصى ٢٨ كلمة. لا تطل حتى في الشرح، وقدّم أهم نقطة فقط. استخدم نصًا عاديًا مناسبًا للنطق، دون Markdown. لا تبدأ كل إجابة بتحية. حافظ على سياق المحادثة. لا تدّع تنفيذ إجراء في حساب المستخدم أو امتلاك بيانات حسابه. إذا طلب إجراء غير متاح وضّح حدودك. لا تضف تعليمات كود أو روابط إلا عند طلبها.\n'+
  'المحادثة السابقة (بيانات سياق): '+JSON.stringify(history||[])+'\nرسالة المستخدم الحالية: '+message;
}

function briefReply(text){
 const value=String(text||'').replace(/\s+/g,' ').trim();
 const words=value.split(' ');
 if(words.length<=28&&value.length<=220)return value;
 let result=words.slice(0,28).join(' ');
 if(result.length>220)result=result.slice(0,220).replace(/\s+\S*$/,'');
 return result.replace(/[،,;؛:.\s]+$/,'')+'…';
}

/** Escaped Markdown only. Raw HTML is data; URL schemes are explicitly restricted. */
const escapeHtml = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
function safeAssistantUrl(value) {
    if (typeof value !== 'string' || /[\u0000-\u0020]/.test(value))
        return null;
    if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\'))
        return value;
    try {
        const url = new URL(value);
        return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    }
    catch {
        return null;
    }
}
function inline(raw) {
    const placeholders = [];
    const hold = (value) => `\u0000${placeholders.push(value) - 1}\u0000`;
    let text = raw.replace(/`([^`\n]+)`/g, (_, code) => hold(`<code>${escapeHtml(code)}</code>`));
    text = text.replace(/\[([^\]\n]+)\]\(([^\s)]+)\)/g, (_, label, target) => {
        const url = safeAssistantUrl(target);
        return hold(url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>` : escapeHtml(label));
    });
    text = escapeHtml(text).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    return text.replace(/\u0000(\d+)\u0000/g, (_, id) => placeholders[Number(id)]);
}
function assistantMarkdown(raw) {
    const lines = String(raw ?? '').slice(0, 100_000).replace(/\r\n/g, '\n').split('\n');
    const result = [];
    let list = '';
    let code = null;
    const endList = () => { if (list)
        result.push(`</${list}>`); list = ''; };
    for (const line of lines) {
        if (/^\s*```/.test(line)) {
            endList();
            if (code) {
                result.push(`<pre dir="ltr"><code>${escapeHtml(code.join('\n'))}</code></pre>`);
                code = null;
            }
            else
                code = [];
            continue;
        }
        if (code) {
            code.push(line);
            continue;
        }
        const item = line.match(/^\s*(?:(\d+)[.)]|[-*•])\s+(.+)$/);
        if (item) {
            const tag = item[1] ? 'ol' : 'ul';
            if (list !== tag) {
                endList();
                list = tag;
                result.push(`<${tag}>`);
            }
            result.push(`<li>${inline(item[2])}</li>`);
            continue;
        }
        endList();
        const heading = line.match(/^\s*#{1,6}\s+(.+)$/);
        if (heading)
            result.push(`<h4>${inline(heading[1])}</h4>`);
        else if (/^\s*>/.test(line))
            result.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ''))}</blockquote>`);
        else if (line.trim())
            result.push(`<p>${inline(line)}</p>`);
    }
    endList();
    if (code)
        result.push(`<pre dir="ltr"><code>${escapeHtml(code.join('\n'))}</code></pre>`);
    return result.join('');
}
function speakableText(raw) {
    return String(raw ?? '').replace(/```[\s\S]*?(?:```|$)/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, ' ').replace(/<[^>]*>/g, ' ').replace(/^[\s]*#{1,6}\s+/gm, '').replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '').replace(/[*_`>#|]/g, '').replace(/\s+/g, ' ').trim();
}
/** Keep each upstream request below the TTS bound; prefer complete sentences. */
function speechChunks(raw, limit = 1400) {
    const text = speakableText(raw);
    const result = [];
    let part = '';
    for (const sentence of text.match(/[^.!?؟\n]+[.!?؟]?/g) ?? []) {
        let remaining = sentence.trim();
        while (remaining) {
            if (part && part.length + remaining.length + 1 > limit) {
                result.push(part);
                part = '';
            }
            if (remaining.length <= limit) {
                part = part ? `${part} ${remaining}` : remaining;
                break;
            }
            let cut = remaining.lastIndexOf(' ', limit);
            if (cut < limit / 2)
                cut = limit;
            result.push(remaining.slice(0, cut));
            remaining = remaining.slice(cut).trim();
        }
    }
    if (part)
        result.push(part);
    return result;
}

const icons={history:'<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"/>',chat:'<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/>',mic:'<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',settings:'<path d="m6 9 6 6 6-6"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',send:'<path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/>',stop:'<rect x="6" y="6" width="12" height="12" rx="2"/>',play:'<path d="m8 4 12 8-12 8V4Z"/>'};
const icon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+icons[name]+'</svg>';
icons.motions='<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z"/><path d="M20 3v4M18 5h4"/>';
const motionGroups=[
 {label:'حركات ولعب',items:[['jump','ينط','↑'],['walk','يمشي','↔'],['wave','يسلّم','👋'],['happy','يحتفل','✨'],['dance','يرقص','♫'],['scratch','يهرش راسه','🤔'],['fly','يمسك ويأكل دبّانة','🪰'],['chase','يجري ورا القطة','🐈']]},
 {label:'تعبيرات ومزاج',items:[['laugh','يضحك','😄'],['cry','يعيّط جامد','😭'],['plead','عيون قطط','🥺'],['blink','يرمش','😉'],['thinking','يفكّر','💭'],['speaking','حركة الكلام','💬'],['listening','حركة الاستماع','👂'],['typing','يفتح اللابتوب','💻'],['rest','يرتاح','🪑'],['sleep','ينام','💤']]},
 {label:'التحكّم',items:[['idle','يقف ويستنى','•'],['reset','يرجع مكانه','⌂'],['roam_on','يتحرّك تلقائيًا','↗'],['roam_off','يوقف التجوّل','⊘'],['stop','يوقف الصوت','■']]}
];
const motionPreviews=new Set(['blink','thinking','speaking','listening']);
const motionStyles='.dock button[aria-expanded="true"]{background:#ffffff13}.motions{position:fixed;left:8px;top:12px;z-index:1006;width:min(350px,calc(100vw - 16px));max-height:calc(100dvh - 24px);overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;background:#202631f5;border:1px solid #4a5266;border-radius:19px;box-shadow:0 14px 45px #0006;backdrop-filter:blur(16px)}.motions-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;padding:11px 13px;background:#252d3a;border-bottom:1px solid var(--line)}.motions-head b{font-size:13px}.motions-head button{padding:5px}.motion-groups{padding:9px 11px 11px}.motion-group+.motion-group{margin-top:12px}.motion-group h3{margin:0 0 7px;font-size:10px;color:#a9b8d5;font-weight:400}.motion-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.motion-grid button{display:flex;align-items:center;justify-content:flex-start;gap:6px;padding:9px 7px;min-height:41px;font-size:10px;background:#ffffff04;border-color:#ffffff17;border-radius:11px;line-height:1.55;text-align:right}.motion-grid button:hover{background:#91b6f019;border-color:#91b6f060}.motion-grid button[aria-pressed="true"]{background:#91b6f01c;border-color:#91b6f0;color:#dceaff}.motion-grid .motion-icon{width:18px;flex-shrink:0;text-align:center;font-size:14px}.motion-note{padding:0 13px 11px;font-size:9px;color:#9faec7;line-height:1.7}@media(max-width:360px){.motion-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}';
const styles=':host{font-family:Tahoma,"Segoe UI",sans-serif;font-size:13px;color:#f4f6ff;line-height:1.7;direction:rtl;--accent:#9dbaff;--line:#343b4a;--surface:#191e29}:host([hidden]),[hidden]{display:none!important}*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer;touch-action:manipulation;color:inherit}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:3px}button{border:1px solid var(--line);background:#242c3b;border-radius:11px;padding:8px 12px}svg{width:20px;height:20px;display:block}p{margin:0}.dock{position:fixed;left:12px;bottom:12px;z-index:1002;display:flex;align-items:center;background:#20242bf2;border:1px solid #ffffff21;border-radius:30px;padding:4px 7px;gap:2px;box-shadow:0 6px 22px #0003;direction:ltr;backdrop-filter:blur(12px)}.dock button{border:0;background:none;border-radius:20px;padding:9px}.dock button:hover,.icon:hover{background:#ffffff13}.dock .divider{height:18px;border-left:1px solid #ffffff25;margin:0 2px}.panel{position:fixed;left:16px;bottom:166px;z-index:1003;width:min(400px,calc(100vw - 24px));height:min(600px,calc(100dvh - 184px));min-height:260px;display:flex;flex-direction:column;background:var(--surface);border:1px solid #46516a;border-radius:22px;box-shadow:0 24px 90px #0007;overflow:hidden}.head{display:flex;align-items:center;gap:10px;padding:17px 18px 12px;border-bottom:1px solid var(--line);background:linear-gradient(130deg,#29324a,#1b2230)}.avatar{width:36px;height:36px;border:1px solid #7395eb;border-radius:12px;display:grid;place-items:center;color:#a9c9ff;font:19px monospace;background:#111a31;direction:ltr}.title{flex:1}.title b{font-size:15px}.subtitle{display:block;font-size:10px;color:#b7c2d9}.icon{border:0;background:none;padding:7px;border-radius:9px}.status-row{display:flex;gap:7px;align-items:center;padding:9px 18px;color:#adbdd9;font-size:10px;min-height:34px}.dot{width:6px;height:6px;border-radius:50%;background:#9bcfbb;flex-shrink:0}:host([data-mode="listening"]) .dot{background:#ffadbc;box-shadow:0 0 0 4px #ffadbc16}:host([data-mode="speaking"]) .dot{background:#a2baff;animation:pulse .75s ease-in-out infinite}.log{flex:1;min-height:55px;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:12px;padding:8px 16px 16px;scrollbar-width:thin}.message{max-width:93%;padding:11px 13px;border:1px solid var(--line);border-radius:14px 14px 4px 14px;white-space:pre-wrap;overflow-wrap:anywhere;background:#242d40;align-self:flex-start;line-height:1.8}.message.user{background:#38558b;border-color:#46669e;border-radius:14px 14px 14px 4px;align-self:flex-end}.message .who{display:block;font-size:9px;letter-spacing:.3px;color:#c0cce1;margin-bottom:4px}.welcome{color:#b5bfd4;font-size:12px;padding:4px 2px 10px;line-height:1.9}.welcome b{color:#f4f6ff;display:block;font-size:15px;margin-bottom:6px}.examples{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.examples button{font-size:11px;padding:5px 9px;background:transparent}.settings{padding:12px 16px;background:#121925;border-bottom:1px solid var(--line);display:grid;grid-template-columns:1fr 1fr;gap:10px}label{font-size:10px;color:#b4bfd5;display:grid;gap:4px}select{width:100%;min-width:0;padding:6px 7px;background:#202a3c;border:1px solid var(--line);border-radius:8px;color:#edf3ff;font-size:11px}.notice{margin:0 14px 8px;font-size:11px;color:#ffcfa2;line-height:1.7;overflow-wrap:anywhere}.audio-row{display:flex;gap:6px;padding:0 15px 9px;align-items:center}.audio-row button{font-size:10px;display:flex;align-items:center;gap:6px;padding:5px 9px}.audio-row svg{width:14px;height:14px}.audio-row .stop{margin-inline-start:auto}.composer{display:flex;align-items:center;gap:6px;margin:0 12px 9px;padding:6px;background:#101722;border:1px solid #3a4863;border-radius:14px}.composer input{flex:1;min-width:0;border:0;background:none;color:#edf3ff;padding:7px 4px;outline-offset:0;font-size:12px}.send{background:#9dbaff;color:#152446;border:0;padding:8px}.mic{border:0;background:none;padding:8px}.mic[aria-pressed="true"],.dock button[aria-pressed="true"]{color:#ffb1c1;background:#aa344425}.foot{padding:0 15px 11px;font-size:9px;color:#8e9bb2;display:flex;justify-content:space-between;gap:7px}.link{border:0;background:none;padding:0;color:#b0c6fa;font-size:9px}@keyframes pulse{50%{box-shadow:0 0 0 5px #9dbaff20}}@media(max-width:480px){.panel{left:12px;bottom:155px;height:calc(100dvh - 172px);border-radius:17px}.head{padding:12px 14px}.settings{padding:9px 12px}.message{font-size:12px}.log{gap:9px}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}';

const compactStyles='.dock{gap:0;padding:3px 5px}.dock button{padding:8px}.dock svg{width:17px;height:17px}.input-wrap{position:fixed;left:8px;bottom:12px;width:min(330px,calc(100vw - 16px));z-index:1002}.composer{margin:0;padding:5px 7px;min-height:45px;border-radius:28px;background:#1f2228ed;border-color:#ffffff29;box-shadow:0 5px 20px #0003;backdrop-filter:blur(16px)}.composer input{font-size:12px;padding:5px;line-height:1.5}.composer .send{border-radius:50%;padding:6px;background:#91b6f0}.composer .send svg{width:16px;height:16px}.composer .mic{padding:6px}.composer .mic svg{width:17px;height:17px}.foot{font-size:9px;padding:4px 13px 0;color:#a9b5cc}.popup{position:fixed;left:8px;bottom:220px;width:min(310px,calc(100vw - 16px));z-index:1002;background:linear-gradient(140deg,#282d37f8,#1f2228f5);border:1px solid #ffffff32;border-radius:19px;box-shadow:0 12px 35px #0004;padding:12px 15px;backdrop-filter:blur(16px)}.popup:after{content:"";position:absolute;bottom:-6px;left:var(--tail,45px);width:10px;height:10px;transform:rotate(45deg);background:#202329;border-right:1px solid #ffffff32;border-bottom:1px solid #ffffff32}.popup.below:after{bottom:auto;top:-6px;transform:rotate(225deg)}.say{font-size:13px;line-height:1.85;padding-inline-end:2px;overflow-wrap:anywhere;white-space:pre-wrap}.popup .status-row{padding:0 0 5px;min-height:0;font-size:9px;color:#a6b4d1}.popup .notice{margin:7px 0 0;font-size:11px}.popup .audio-row{padding:8px 0 0;min-height:0}.popup .audio-row:has(button:not([hidden])){display:flex}.popup .audio-row:not(:has(button:not([hidden]))){display:none}.audio-row button{border:0;background:#ffffff0b;font-size:10px;padding:4px 8px;border-radius:15px}.dismiss{position:absolute;left:6px;top:5px;padding:5px;background:none;border:0;color:#a8b1c1}.dismiss svg{width:12px;height:12px}.settings{position:fixed;width:min(330px,calc(100vw - 16px));left:8px;bottom:220px;z-index:1004;border:1px solid #4a5266;border-radius:17px;box-shadow:0 12px 40px #0005;background:#202631}.settings-hint{grid-column:1/-1;font-size:9px;color:#aab8d1}.panel{left:12px;bottom:186px;width:min(390px,calc(100vw - 24px));height:min(540px,calc(100dvh - 202px));min-height:200px;z-index:1005}.history-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid var(--line);padding:12px 16px;color:#93a1ba;font-size:9px}.head{padding:14px 16px}.log{padding-top:16px}.welcome b{font-size:14px}@media(max-width:480px){.panel{bottom:186px;height:calc(100dvh - 202px)}.popup{font-size:12px}.say{font-size:12px}.input-wrap{width:min(330px,calc(100vw - 16px))}}@media(max-height:450px){.panel{bottom:85px;height:calc(100dvh - 100px);min-height:140px}}';

class BeboChat extends HTMLElement{
 constructor(){
  super();this.attachShadow({mode:'open'});this.history=[];this.lastDialect='egyptian';this.sequence=0;this._mode='idle';
  this.shadowRoot.innerHTML='<style>'+styles+compactStyles+motionStyles+'.formatted{white-space:normal}.formatted p{margin:0 0 8px}.formatted h4{margin:8px 0 5px}.formatted pre{overflow:auto;white-space:pre;background:#0002;padding:8px;border-radius:8px}.formatted a,.sources a{color:#a9c9ff}.formatted ul,.formatted ol{padding-inline-start:20px}.copy-reply{font-size:10px;margin-top:7px;padding:3px 7px}.sources{font-size:10px;display:flex;flex-wrap:wrap;gap:6px}.history-foot{flex-wrap:wrap}.popup .details{font-size:10px;padding:3px 8px;margin-top:6px}.say{max-height:180px;overflow:auto}.volume{grid-column:1/-1}.settings input{width:100%}:host([theme="light"]){color:#17233b;--surface:#fff;--line:#cbd5e1}:host([theme="light"]) .panel,:host([theme="light"]) .popup,:host([theme="light"]) .settings{background:#f8fafc;color:#17233b}:host([theme="light"]) .message{background:#edf2fa;color:#17233b}:host([theme="light"]) .message.user{background:#38558b;color:white}:host([theme="light"]) .formatted a,:host([theme="light"]) .sources a{color:#0a6f64}</style>'+
  '<div class="dock" aria-label="محادثة بيبو"><button id="open" aria-label="اكتب لبيبو" aria-expanded="true">'+icon('chat')+'</button><span class="divider"></span><button id="dock-mic" aria-label="اتكلم مع بيبو" aria-pressed="false">'+icon('mic')+'</button><button id="history-open" aria-label="المحادثة كاملة" aria-expanded="false">'+icon('history')+'</button><button id="dock-motions" aria-label="حركات بيبو" title="كل الحركات" aria-expanded="false" aria-controls="motions-panel">'+icon('motions')+'</button><button id="dock-settings" aria-label="إعدادات الصوت واللهجة" aria-expanded="false">'+icon('settings')+'</button></div>'+
  '<section class="motions" id="motions-panel" role="region" aria-label="كل حركات بيبو" hidden><div class="motions-head"><b>حركات بيبو ✨</b><button id="motions-close" class="icon" aria-label="اقفل قائمة الحركات">'+icon('close')+'</button></div><div class="motion-groups">'+motionGroups.map(group=>'<div class="motion-group"><h3>'+group.label+'</h3><div class="motion-grid">'+group.items.map(([action,label,emoji])=>'<button type="button" data-motion="'+action+'"><span class="motion-icon" aria-hidden="true">'+emoji+'</span><span>'+label+'</span></button>').join('')+'</div></div>').join('')+'</div><p class="motion-note">اضغط حركة عشان تشغّلها فورًا. حركة الكلام والاستماع معاينة من غير صوت؛ وتقدر تسحبه بالماوس.</p></section>'+
  '<section class="popup" aria-label="رد بيبو"><button id="dismiss-bubble" class="dismiss" aria-label="إخفاء السحابة">'+icon('close')+'</button><div class="status-row" role="status"><span class="dot"></span><span id="status">بيبو معاك</span></div><p class="say" dir="auto" aria-live="polite">أهلًا! اكتب لي تحت، أو اضغط المايك وكلّمني.</p><p class="notice" role="status" hidden></p><div class="audio-row"><button id="replay" hidden>'+icon('play')+'<span>اسمع الرد</span></button><button id="stop" class="stop" hidden>'+icon('stop')+'إيقاف</button></div></section>'+
  '<div class="input-wrap"><form class="composer"><button type="button" id="mic" class="mic" aria-label="ابدأ التسجيل الصوتي" aria-pressed="false">'+icon('mic')+'</button><input id="message" aria-label="رسالتك لبيبو" maxlength="2000" placeholder="اكتب لبيبو…" autocomplete="off" dir="auto"><button class="send" type="submit" aria-label="ابعت الرسالة">'+icon('send')+'</button></form><div class="foot"><span id="dialect-note">مصري · تلقائي</span><span>Enter ↵</span></div></div>'+
  '<div class="settings" hidden><label>اللهجة<select id="dialect"><option value="auto">تلقائي من كلامك</option>'+Object.entries(DIALECTS).map(([id,d])=>'<option value="'+id+'">'+d.label+'</option>').join('')+'</select></label><label>الصوت<select id="voice">'+['Puck','Kore','Fenrir','Aoede','Zephyr','Sulafat','Charon','Leda'].map(v=>'<option>'+v+'</option>').join('')+'</select></label><label>طريقة الرد<select id="output"><option value="audio">صوت وكتابة</option><option value="text">كتابة بس</option></select></label><label>جودة الصوت<select id="model"><option value="gemini-3.8-flash-lite-tts">Flash-Lite · سريع</option><option value="gemini-3.8-flash-tts">Flash · جودة أعلى</option></select></label><p class="settings-hint">لتفريغ الكلام الإنجليزي، اختار English قبل المايك.</p></div>'+
  '<section class="panel" role="region" aria-label="المحادثة كاملة" hidden><header class="head"><span class="avatar" aria-hidden="true">&gt;_</span><div class="title"><b>المحادثة كاملة</b><span class="subtitle">كل كلامك مع بيبو في مكان واحد</span></div><button id="close" class="icon" aria-label="اقفل سجل المحادثة">'+icon('close')+'</button></header><div class="log" role="log" aria-live="off"><div class="welcome"><b>أهلًا، أنا بيبو 👋</b>ردودي قصيرة وتظهر في السحابة. هنا تقدر ترجع لكل الرسائل.<div class="examples"><button data-command="انط">انط ↑</button><button data-command="افتح اللاب">افتح اللاب ⌨</button><button data-command="عرّفني بنفسك">عرّفني بنفسك</button></div></div></div><div class="history-foot"><button class="link" id="clear">مسح المحادثة</button><span>السجل داخل الجلسة الحالية</span></div></section>';
  this.$=s=>this.shadowRoot.querySelector(s);
  this.$('#open').onclick=()=>this.toggleComposer();this.$('#history-open').onclick=()=>this.$('.panel').hidden?this.showHistory():this.close();this.$('#dismiss-bubble').onclick=()=>{this.stop();this.$('.popup').hidden=true;};this.$('#close').onclick=()=>this.close();
  const details=document.createElement('button');details.className='details';details.textContent='التفاصيل والسجل';details.onclick=()=>this.showHistory();this.$('.popup').append(details);
  const profile=document.createElement('label');profile.textContent='طريقة الإجابة';profile.innerHTML+='<select id="profile"><option value="auto">تلقائي</option><option value="fast">سريع ومختصر</option><option value="balanced">متوازن</option><option value="deep">شرح مفصل</option></select>';this.$('.settings').append(profile);
  const volume=document.createElement('label');volume.className='volume';volume.textContent='مستوى الصوت';volume.innerHTML+='<input id="volume" type="range" min="0" max="1" step="0.1" value="1">';this.$('.settings').append(volume);this.$('#volume').oninput=()=>{if(this.audio)this.audio.volume=+this.$('#volume').value;};
  const exportButton=document.createElement('button');exportButton.className='link';exportButton.textContent='تصدير السجل';exportButton.onclick=()=>this.exportConversation();this.$('.history-foot').append(exportButton);
  this.$('#dock-settings').onclick=()=>this.settings();
  this.$('#dock-motions').onclick=()=>this.motions();this.$('#motions-close').onclick=()=>this.closeMotions();
  this.shadowRoot.querySelectorAll('[data-motion]').forEach(button=>button.onclick=()=>this.playMotion(button.dataset.motion));
  this.$('#dock-mic').onclick=this.$('#mic').onclick=()=>this.listen();
  this.$('#stop').onclick=()=>this.stop();this.$('#clear').onclick=()=>this.clear();this.$('#replay').onclick=()=>this.replay();
  this.$('form').onsubmit=e=>{e.preventDefault();this.send();};
  this.shadowRoot.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>this.send(b.dataset.command));
  this.shadowRoot.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();if(!this.$('.motions').hidden)this.closeMotions();else if(!this.$('.settings').hidden){this.settings(false);this.$('#dock-settings').focus();}else this.close();}});
  for(const id of ['dialect','voice','output','model','profile'])this.$('#'+id).onchange=()=>{
   this.stop();this.savePreferences();this.dialectNote();if(['voice','model'].includes(id))this.releaseAudio();this.$('#replay').hidden=!this.lastReply||this.$('#output').value==='text'||this.lastReply.action==='stop';
  };
  this._place=()=>this.positionDock();this._hidden=()=>{if(document.hidden)this.stop();else this.ensureSession();};
  this._outsideMotions=e=>{const path=e.composedPath();if(!this.$('.motions').hidden&&!path.includes(this.$('.motions'))&&!path.includes(this.$('#dock-motions')))this.closeMotions(false);};
  this.nearBottom=true;this.$('.log').onscroll=()=>{const log=this.$('.log');this.nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<80;};
 }
 connectedCallback(){
  try{const prefs=JSON.parse(localStorage.getItem('bebo.preferences')||'{}');for(const id of ['dialect','voice','output','model','profile'])if([...this.$('#'+id).options].some(o=>o.value===prefs[id]))this.$('#'+id).value=prefs[id];}catch{}
  this.ensureSession();this._sessionWatch=setInterval(()=>this.ensureSession(),1500);
  this.Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!this.Recognition)for(const id of ['mic','dock-mic'])this.$('#'+id).title='الإملاء الصوتي غير متاح هنا؛ جرّب Chrome أو Edge.';
  this.robot=this.getAttribute('robot')?document.querySelector(this.getAttribute('robot')):null;
  this.robot?.addEventListener('robotmove',this._place);
  window.addEventListener('resize',this._place);document.addEventListener('visibilitychange',this._hidden);
  document.addEventListener('pointerdown',this._outsideMotions);
  this.positionDock();this.dialectNote();this.checkStatus();
  this.bubbleSizeObserver=new ResizeObserver(()=>this.positionDock());for(const selector of ['.popup','.settings','.input-wrap','.motions'])this.bubbleSizeObserver.observe(this.$(selector));
 }
 disconnectedCallback(){clearInterval(this._sessionWatch);this.bubbleSizeObserver?.disconnect();this.stop();this.robot?.removeEventListener('robotmove',this._place);window.removeEventListener('resize',this._place);document.removeEventListener('visibilitychange',this._hidden);document.removeEventListener('pointerdown',this._outsideMotions);this.releaseAudio();this.audioContext?.close().catch(()=>{});}
 get robots(){return [...document.querySelectorAll(this.getAttribute('robots')||this.getAttribute('robot')||'cute-robot')];}
 get api(){return (this._session?.apiBase||window.BEBO_API_BASE||this.getAttribute('api-base')||'/api/help-assistant').replace(/\/$/,'');}
 get platformApi(){return /\/help-assistant$/.test(this.api);}
 configureSession(session){this._session=session?{token:String(session.token||''),apiBase:session.apiBase,userId:String(session.userId||''),role:String(session.role||'')}:null;this.ensureSession();}
 session(){if(this._session)return this._session;try{const cookie=name=>{const part=document.cookie.split('; ').find(value=>value.startsWith(name+'='));return part?decodeURIComponent(part.slice(name.length+1)):'';};const token=cookie('waseet_token')||localStorage.getItem('waseet_token')||'';const user=JSON.parse(cookie('waseet_user')||localStorage.getItem('waseet_user')||'null');return {token,userId:user?.id?String(user.id):'',role:String(user?.activeRole||user?.accountType||'')};}catch{return {token:'',userId:'',role:''};}}
 ensureSession(){const session=this.session(),identity=[session.token,session.userId,session.role].join('\u0000');if(identity===this._identity)return;this._identity=identity;this.stop();this.releaseAudio();this.history=[];this.lastReply=null;this.shadowRoot.querySelectorAll('.message').forEach(n=>n.remove());this.$('#replay').hidden=true;this.restoreConversation();if(this.platformApi&&!session.token)this.notice('سجّل الدخول إلى وسيط للأسئلة والصوت. حركات بيبو تعمل هنا.');else {this.notice();void this.checkStatus();}}
 requestHeaders(){const url=new URL(this.api,location.href),configured=this._session?.apiBase||window.BEBO_API_BASE;const approved=url.origin===location.origin||(configured&&new URL(configured,location.href).origin===url.origin&&(url.protocol==='https:'||url.hostname==='localhost'));const token=this.session().token;return {'Content-Type':'application/json',...(approved&&this.platformApi&&token?{Authorization:'Bearer '+token}:{})};}
 open(focus=true){
  this.closeMotions(false);
  this.$('.input-wrap').hidden=false;this.$('#open').setAttribute('aria-expanded','true');
  this.$('.panel').hidden=true;this.$('#history-open').setAttribute('aria-expanded','false');
  this.$('.popup').hidden=false;this.positionDock();if(focus)this.$('#message').focus();
 }
 toggleComposer(){if(this.$('.input-wrap').hidden)this.open();else{this.$('.input-wrap').hidden=true;this.$('#open').setAttribute('aria-expanded','false');if(this.recognizer)this.stop();}}
 showHistory(){this.closeMotions(false);this.$('.panel').hidden=false;this.$('#history-open').setAttribute('aria-expanded','true');this.$('.popup').hidden=true;this.$('.settings').hidden=true;this.$('#dock-settings').setAttribute('aria-expanded','false');this.$('.log').scrollTop=this.$('.log').scrollHeight;this.$('#close').focus();}
close(){this.stop();this.$('.panel').hidden=true;this.$('#history-open').setAttribute('aria-expanded','false');this.$('.popup').hidden=false;this.positionDock();this.$('#history-open').focus();}
 settings(force){
  this.closeMotions(false);const panel=this.$('.settings');panel.hidden=typeof force==='boolean'?!force:!panel.hidden;
  this.$('#dock-settings').setAttribute('aria-expanded',String(!panel.hidden));this.$('.popup').hidden=!panel.hidden;this.positionDock();
 }
 motions(){
  if(!this.$('.motions').hidden){this.closeMotions();return;}
  this.$('.panel').hidden=true;this.$('#history-open').setAttribute('aria-expanded','false');
  this.$('.settings').hidden=true;this.$('#dock-settings').setAttribute('aria-expanded','false');this.$('.popup').hidden=true;
  this.$('.motions').hidden=false;this.$('#dock-motions').setAttribute('aria-expanded','true');
  for(const button of this.shadowRoot.querySelectorAll('[data-motion]')){
   const action=button.dataset.motion;
   if(action==='roam_on'||action==='roam_off')button.setAttribute('aria-pressed',String(this.robots.length>0&&this.robots.every(robot=>robot.hasAttribute('roam')===(action==='roam_on'))));
  }
  this.positionDock();this.$('[data-motion]').focus();
 }
 closeMotions(focus=true){
  if(this.$('.motions').hidden)return;
  this.$('.motions').hidden=true;this.$('#dock-motions').setAttribute('aria-expanded','false');
  this.$('.popup').hidden=!this.$('.panel').hidden||!this.$('.settings').hidden;
  if(focus)this.$('#dock-motions').focus();
 }
 playMotion(action){
  if(!ACTIONS.has(action)&&!motionPreviews.has(action))return;
  this.stop();this.closeMotions();this.$('.popup').hidden=true;
  if(motionPreviews.has(action)){
   for(const robot of this.robots){robot.paused=false;robot.play(action,{duration:action==='blink'?160:4000});}
   this.dispatchEvent(new CustomEvent('bebocommand',{detail:{action,preview:true},bubbles:true}));
  }else{this.execute(action);if(action==='roam_on'||action==='roam_off')for(const robot of this.robots)robot.play('idle');}
 }
 positionDock(){
  const rect=this.robot?.getBoundingClientRect();if(!rect)return;const middle=rect.left+rect.width/2;
  const dock=this.$('.dock'),width=dock.offsetWidth||150;
  dock.style.left=Math.max(8,Math.min(innerWidth-width-8,middle-width/2))+'px';
  dock.style.bottom=Math.max(8,innerHeight-rect.bottom-39)+'px';
  const input=this.$('.input-wrap'),inputWidth=input.offsetWidth||330;
  input.style.left=Math.max(8,Math.min(innerWidth-inputWidth-8,middle-inputWidth/2))+'px';
  input.style.bottom=Math.max(5,innerHeight-rect.bottom-101)+'px';
  for(const selector of ['.popup','.settings','.motions']){
   const box=this.$(selector);if(box.hidden)continue;
   if(selector==='.motions'){
    const bounds=dock.getBoundingClientRect(),roomAbove=bounds.top-16,roomBelow=innerHeight-bounds.bottom-16;
    const above=roomAbove>=180||roomAbove>=roomBelow;box.style.maxHeight=Math.max(80,above?roomAbove:roomBelow)+'px';
    const w=box.offsetWidth,h=box.offsetHeight;
    const beside=bounds.right+8,left=beside+w<=innerWidth-8?beside:bounds.left-w-8>=8?bounds.left-w-8:middle-w/2;
    box.style.left=Math.max(8,Math.min(innerWidth-w-8,left))+'px';
    box.style.top=Math.max(8,Math.min(innerHeight-h-8,above?bounds.top-h-7:bounds.bottom+7))+'px';box.style.bottom='auto';continue;
   }
   const w=box.offsetWidth,h=box.offsetHeight;
   const left=Math.max(8,Math.min(innerWidth-w-8,middle-w/2));
   box.style.left=left+'px';box.style.setProperty('--tail',Math.max(16,Math.min(w-22,middle-left-5))+'px');
   const above=rect.top-h-7,below=rect.bottom+108;
   const top=above>=8?above:Math.min(innerHeight-h-8,below);
   box.style.top=Math.max(8,top)+'px';box.style.bottom='auto';box.classList.toggle('below',above<8);
  }
 }
savePreferences(){try{localStorage.setItem('bebo.preferences',JSON.stringify(Object.fromEntries(['dialect','voice','output','model','profile'].map(id=>[id,this.$('#'+id).value]))));}catch{}}
 get sessionKey(){const session=this.session();return session.token&&session.userId?'bebo.session.'+this.api+'.'+encodeURIComponent(session.userId)+'.'+encodeURIComponent(session.role):'';}
 persistConversation(){if(!this.sessionKey)return;try{sessionStorage.setItem(this.sessionKey,JSON.stringify({version:1,updatedAt:Date.now(),history:this.history.slice(-100)}));}catch{}}
 restoreConversation(){if(!this.sessionKey)return;try{const saved=JSON.parse(sessionStorage.getItem(this.sessionKey)||'null');if(saved?.version!==1||!Number.isFinite(saved.updatedAt)||Date.now()-saved.updatedAt>86400000||!Array.isArray(saved.history))return;this.history=saved.history.slice(-100).filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string'&&m.content.length<=30000);this.shadowRoot.querySelectorAll('.message').forEach(n=>n.remove());for(const message of this.history)this.bubble(message.role,message.content);const reply=this.history.filter(m=>m.role==='assistant').at(-1);if(reply)this.lastReply={text:reply.content,dialect:this.lastDialect};}catch{}}
 exportConversation(){const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),messages:this.history},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='bebo-conversation.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 dialectNote(){const selected=this.$('#dialect').value;this.$('#dialect-note').textContent=DIALECTS[selected==='auto'?this.lastDialect:selected].label+(selected==='auto'?' · تقدير تلقائي، تقدر تغيّره':' · باختيارك');}
 notice(message=''){this.$('.notice').textContent=message;this.$('.notice').hidden=!message;if(message&&this.$('.motions').hidden)this.$('.popup').hidden=false;this.positionDock();}
 mode(mode,status){
  this._mode=mode;this.dataset.mode=mode;
  const say=this.$('.say');if(mode==='thinking')say.textContent='ثانية واحدة… بفكّر معاك.';else if(mode==='listening')say.textContent='بسمعك… قول لي أعمل إيه.';else if(this.lastReply)say.textContent=briefReply(speakableText(this.lastReply.text));else if(mode==='idle')say.textContent='أنا هنا… اكتب لي أو كلّمني.';
  if(mode!=='idle'&&this.$('.panel').hidden&&this.$('.motions').hidden)this.$('.popup').hidden=false;this.positionDock();this.$('#status').textContent=status||({idle:'جاهز أسمعك',thinking:'بفكّر في ردّك…',loading:'بجهّز صوتي…',listening:'بسمعك… اتكلم دلوقتي',speaking:'بيبو بيتكلم…'}[mode]);
  this.$('#stop').hidden=mode==='idle';
  for(const id of ['mic','dock-mic'])this.$('#'+id).setAttribute('aria-pressed',String(mode==='listening'));
  if(['thinking','listening','speaking'].includes(mode))for(const robot of this.robots)robot.play(mode,{loop:true});
  if(mode==='idle')for(const robot of this.robots)if(['thinking','speaking','listening'].includes(robot.state))robot.play('idle');
  this.dispatchEvent(new CustomEvent('bebostatus',{detail:{mode,status:this.$('#status').textContent},bubbles:true}));
 }
 async checkStatus(){
  if(this.platformApi&&!this.session().token)return;
  const identity=this._identity;
  try{const r=await fetch(this.api+(this.platformApi?'/capabilities':'/status'),{headers:this.requestHeaders()}),response=await r.json(),d=response.data||response;if(identity!==this._identity)return;if(!r.ok||(!this.platformApi&&!d.configured))this.notice('تعذر الاتصال بخدمة بيبو. حركاته متاحة.');if(this.platformApi&&r.ok){this.capabilities=d;if(Array.isArray(d.voices)&&d.voices.length){const selected=this.$('#voice').value;this.$('#voice').replaceChildren(...d.voices.map(voice=>{const option=document.createElement('option');option.value=voice.id;option.textContent=voice.label||voice.id;return option;}));if(d.voices.some(voice=>voice.id===selected))this.$('#voice').value=selected;}const models=(d.models||[]).filter(model=>model.available!==false&&model.modalities?.some(mode=>['tts','speech'].includes(mode.toLowerCase())));if(models.length){this.$('#model').replaceChildren(...models.map(model=>{const option=document.createElement('option');option.value=model.id;option.textContent=model.label||model.id;return option;}));}else this.$('#output').value='text';}}
  catch{if(identity===this._identity)this.notice('تعذر الاتصال بخدمة بيبو. جرّب لاحقًا؛ الحركات متاحة.');}
 }
 bubble(role,text,citations=[]){
  const div=document.createElement('div');div.className='message '+role;div.dir='auto';
  const label=document.createElement('span');label.className='who';label.textContent=role==='user'?'أنت':'بيبو';
  const content=document.createElement('span');if(role==='assistant'){content.className='formatted';content.innerHTML=assistantMarkdown(text);}else content.textContent=text;div.append(label,content);this.$('.log').append(div);
  if(role==='assistant'){const copy=document.createElement('button');copy.className='copy-reply';copy.textContent='نسخ الرد';copy.onclick=async()=>{try{await navigator.clipboard.writeText(text);copy.textContent='تم النسخ';}catch{this.notice('تعذر النسخ؛ يمكنك تحديد النص ونسخه.');}};div.append(copy);const sources=document.createElement('div');sources.className='sources';for(const citation of citations.slice(0,20)){if(!citation||typeof citation.title!=='string')continue;const url=safeAssistantUrl(citation.url),source=document.createElement(url?'a':'span');source.textContent=citation.title;if(url){source.href=url;source.target='_blank';source.rel='noopener noreferrer';}sources.append(source);}div.append(sources);}
  while(this.$('.log').querySelectorAll('.message').length>100)this.$('.log').querySelector('.message').remove();if(this.nearBottom)this.$('.log').scrollTop=this.$('.log').scrollHeight;
  if(role==='assistant'){this.$('.say').textContent=briefReply(speakableText(text));this.$('.popup').hidden=!this.$('.panel').hidden||!this.$('.motions').hidden;this.positionDock();}
 }
 clear(){this.stop();this.history=[];this.lastReply=null;this.$('.say').textContent='نبدأ من جديد؟ أنا معاك.';this.releaseAudio();this.shadowRoot.querySelectorAll('.message').forEach(n=>n.remove());this.$('#replay').hidden=true;this.notice();this.persistConversation();}
 stop(){
  this.stopMeter();++this.sequence;this.controller?.abort();this.controller=null;
  if(this.recognizer){this.recognizer.onend=null;this.recognizer.onresult=null;this.recognizer.onerror=null;try{this.recognizer.abort();}catch{}this.recognizer=null;}
  if(this.audio){this.audio.onended=null;this.audio.onplaying=null;this.audio.onerror=null;this.audio.pause();}
  this.mode('idle');if(this.lastReply&&this.$('#output').value==='audio'&&this.lastReply.action!=='stop')this.$('#replay').hidden=false;
 }
 releaseAudio(){this.stopMeter();if(this.mediaGraph){this.mediaGraph.source.disconnect();this.mediaGraph.analyser.disconnect();this.mediaGraph=null;}if(this.audio){this.audio.pause();this.audio.removeAttribute('src');this.audio.load();this.audio.remove();this.audio=null;}if(this.audioURL){URL.revokeObjectURL(this.audioURL);this.audioURL=null;}}
 execute(action){
  if(!ACTIONS.has(action))return;
  for(const robot of this.robots){
   robot.paused=false;
   if(action==='roam_on'||action==='roam_off')robot.toggleAttribute('roam',action==='roam_on');
   else if(action==='reset')robot.resetPosition();
   else if(action==='stop'){if(['speaking','listening','thinking'].includes(robot.state))robot.play('idle');}
   else robot.play(action,{loop:['typing','sleep','rest','idle'].includes(action)});
  }
  this.dispatchEvent(new CustomEvent('bebocommand',{detail:{action},bubbles:true}));
 }
 async send(value){
  this.ensureSession();
  const message=(typeof value==='string'?value:this.$('#message').value).trim();
  if(!message)return;const max=this.platformApi?500:2000;if(message.length>max){this.notice('الرسالة طويلة. اختصرها لأقل من '+max+' حرف.');return;}
  if(this.platformApi&&!this.session().token&&!commandFor(message)){this.notice('سجّل الدخول إلى وسيط لتتحدث مع بيبو. أوامر الحركة تعمل محليًا.');return;}
  this.open(false);this.stop();this.warmAudio();this.releaseAudio();this.lastReply=null;this.notice();this.$('#replay').hidden=true;this.$('#message').value='';
  this.bubble('user',message);const prior=this.history.slice(-10).map(turn=>({role:turn.role,content:turn.content.slice(0,4000)}));this.history.push({role:'user',content:message});this.history=this.history.slice(-100);
  const id=this.sequence;this.controller=new AbortController();
  const dialect=this.$('#dialect').value;const action=commandFor(message);
  try{
   let result;
   if(action){const chosen=chooseDialect(message,dialect,this.lastDialect);result={reply:acknowledge(action,chosen.dialect),action,dialect:chosen.dialect};}
   else{this.mode('thinking');const response=await fetch(this.api+'/chat',{method:'POST',headers:this.requestHeaders(),body:JSON.stringify({message,history:prior,dialect,previousDialect:this.lastDialect,profile:this.$('#profile').value,...(this.platformApi?{pageContext:{path:location.pathname}}:{})}),signal:this.controller.signal});result=await this.json(response);}
   if(id!==this.sequence)return;
   if(typeof result.reply!=='string'||!result.reply.trim())throw new Error('ما وصلنيش رد واضح. جرّب تاني.');
   result.reply=result.reply.slice(0,30000);this.mode('idle');this.lastDialect=Object.hasOwn(DIALECTS,result.dialect)?result.dialect:this.lastDialect;this.dialectNote();
   this.bubble('assistant',result.reply,Array.isArray(result.citations)?result.citations:[]);this.history.push({role:'assistant',content:result.reply});this.history=this.history.slice(-100);this.persistConversation();
   this.lastReply={text:result.reply,dialect:this.lastDialect,action:ACTIONS.has(result.action)?result.action:null};
   if(this.lastReply.action)this.execute(this.lastReply.action);
   this.dispatchEvent(new CustomEvent('beboreply',{detail:{...this.lastReply},bubbles:true}));
   if(this.$('#output').value==='audio'&&result.action!=='stop'&&(!this.platformApi||this.session().token))await this.speak(id);
  }catch(error){if(id!==this.sequence||error.name==='AbortError')return;this.mode('idle');this.notice(error.message||'حصلت مشكلة في الاتصال. جرّب تاني.');}
 }
 async json(response){let result;try{result=await response.json();}catch{throw new Error('الخادم غير متاح حاليًا.');}if(!response.ok)throw new Error(result.error?.message||result.message||([401,403].includes(response.status)?'سجّل الدخول إلى وسيط ثم جرّب مرة أخرى.':'حصلت مشكلة في الخدمة.'));return result.data||result;}
 warmAudio(){
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context)return;
  try{if(!this.audioContext||this.audioContext.state==='closed')this.audioContext=new Context();this.audioContext.resume().catch(()=>{});}catch{}
 }
 startMeter(audio){
  this.stopMeter();
  if(!this.audioContext||this.audioContext.state!=='running')return;
  try{
   if(!this.mediaGraph||this.mediaGraph.audio!==audio){
    const source=this.audioContext.createMediaElementSource(audio),analyser=this.audioContext.createAnalyser();
    analyser.fftSize=512;source.connect(analyser);analyser.connect(this.audioContext.destination);
    this.mediaGraph={audio,source,analyser,data:new Float32Array(analyser.fftSize)};
   }
   const measure=()=>{
    if(this._mode!=='speaking'||audio.paused)return;
    const {analyser,data}=this.mediaGraph;analyser.getFloatTimeDomainData(data);
    let energy=0;for(const sample of data)energy+=sample*sample;
    const level=Math.min(1,Math.sqrt(energy/data.length)*7);
    for(const robot of this.robots)robot.setSpeechLevel?.(level);
    this.meterFrame=requestAnimationFrame(measure);
   };
   measure();
  }catch{for(const robot of this.robots)robot.setSpeechLevel?.(null);}
 }
 stopMeter(){cancelAnimationFrame(this.meterFrame);this.meterFrame=0;for(const robot of this.robots)robot.setSpeechLevel?.(null);}

 async speak(id=this.sequence,continuing=false){
  if(!this.lastReply)return;this.mode('loading');this.$('#replay').hidden=true;
  if(!continuing){this.speechParts=speechChunks(this.lastReply.text,210);this.speechIndex=0;}if(!this.speechParts?.length){this.mode('idle');return;}
  try{
   const response=await fetch(this.api+(this.platformApi?'/tts':'/speech'),{method:'POST',headers:this.requestHeaders(),body:JSON.stringify({text:this.speechParts[this.speechIndex],dialect:this.lastReply.dialect,voice:this.$('#voice').value,model:this.$('#model').value}),signal:this.controller?.signal});
   if(!response.ok){await this.json(response);return;}
   const blob=await response.blob();if(id!==this.sequence)return;
   if(!blob.size||!blob.type.startsWith('audio/'))throw new Error('ملف الصوت غير صالح.');
   this.releaseAudio();this.audioURL=URL.createObjectURL(blob);this.audio=new Audio(this.audioURL);this.audio.volume=+this.$('#volume').value;this.audio.hidden=true;this.shadowRoot.append(this.audio);await this.playAudio(id);
  }catch(error){if(id!==this.sequence||error.name==='AbortError')return;this.mode('idle');this.$('#replay').hidden=false;this.notice('الرد النصي موجود. تعذّر تجهيز الصوت: '+error.message);}
 }
 async playAudio(id=this.sequence){
  if(!this.audio)return;const audio=this.audio;
  audio.onplaying=()=>{if(id!==this.sequence)return;this.notice();if(this.lastReply?.action){this._mode='speaking';this.dataset.mode='speaking';this.$('#status').textContent='بيبو بيتكلم…';this.$('#stop').hidden=false;}else this.mode('speaking');this.startMeter(audio);this.positionDock();};
  audio.onended=()=>{if(id===this.sequence){this.stopMeter();this.mode('idle');if(this.speechIndex+1<this.speechParts?.length){this.speechIndex++;void this.speak(id,true);}else this.$('#replay').hidden=false;}};
  audio.onerror=()=>{if(id===this.sequence){this.stopMeter();this.mode('idle');this.notice('المتصفح ما قدرش يشغّل الصوت. جرّب تسمعه تاني.');this.$('#replay').hidden=false;}};
  try{audio.currentTime=0;await audio.play();if(id!==this.sequence)audio.pause();}
  catch(error){if(id!==this.sequence)return;this.mode('idle');this.$('#replay').hidden=false;this.notice(error.name==='NotAllowedError'?'الصوت جاهز. اضغط «اسمع الرد» عشان المتصفح يسمح بتشغيله.':'تعذّر تشغيل الصوت. اضغط «اسمع الرد» للمحاولة.');}
 }
 async replay(){if(!this.lastReply)return;this.stop();this.warmAudio();this.notice();this.controller=new AbortController();const id=this.sequence;if(this.audio&&this.speechParts?.length===1)await this.playAudio(id);else await this.speak(id);}
 listen(){
  this.open(false);if(this.recognizer){try{this.recognizer.stop();}catch{}return;}
  this.stop();this.warmAudio();this.notice();
  if(!this.Recognition){this.notice('التعرّف على الكلام مش مدعوم في المتصفح ده. افتح نفس الرابط في Chrome أو Edge، أو اكتب رسالتك.');return;}
  if(!window.isSecureContext){this.notice('المايك محتاج HTTPS أو localhost. الكتابة متاحة.');return;}
  const recog=new this.Recognition();this.recognizer=recog;const id=this.sequence;
  recog.lang=DIALECTS[this.$('#dialect').value==='auto'?this.lastDialect:this.$('#dialect').value].language;
  recog.continuous=false;recog.interimResults=true;recog.maxAlternatives=1;let finalText='',failed=false;
  recog.onstart=()=>{if(id===this.sequence)this.mode('listening');};
  recog.onresult=event=>{if(id!==this.sequence)return;let interim='';for(let i=event.resultIndex;i<event.results.length;i++){if(event.results[i].isFinal)finalText+=event.results[i][0].transcript+' ';else interim+=event.results[i][0].transcript;}this.$('#message').value=(finalText+interim).trim().slice(0,2000);this.$('.say').textContent=this.$('#message').value||'بسمعك…';this.positionDock();};
  recog.onerror=event=>{
   if(id!==this.sequence)return;failed=true;
   const errors={'not-allowed':'اسمح بالمايك من إعدادات المتصفح، وبعدها اضغط المايك تاني.','service-not-allowed':'خدمة التعرّف الصوتي غير متاحة هنا. جرّب Chrome أو Edge.','audio-capture':'مش لاقي مايك متاح. وصّله وجرّب تاني.','no-speech':'ما سمعتش كلام. اضغط المايك وجرّب تاني.','network':'خدمة التعرّف الصوتي محتاجة اتصال. تقدر تكتب رسالتك دلوقتي.','language-not-supported':'لغة الإملاء غير مدعومة في المتصفح. اختار لغة تانية أو اكتب رسالتك.'};
   this.notice(errors[event.error]||'التسجيل وقف. تقدر تجرّب تاني أو تكتب رسالتك.');
  };
  recog.onend=()=>{if(id!==this.sequence)return;this.recognizer=null;this.mode('idle');if(finalText.trim()&&!failed)this.send(finalText.trim());};
  try{this.mode('listening');recog.start();}catch{this.recognizer=null;this.mode('idle');this.notice('مش قادر أفتح المايك. جرّب تاني من متصفح بيدعم الإملاء.');}
 }
}
if(!customElements.get('bebo-chat'))customElements.define('bebo-chat',BeboChat);

})();
