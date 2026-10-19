
export const DIALECTS = {
  egyptian:{label:'مصري',language:'ar-EG',prompt:'العامية المصرية الطبيعية'},
  saudi:{label:'سعودي',language:'ar-SA',prompt:'اللهجة السعودية الطبيعية'},
  gulf:{label:'خليجي',language:'ar-KW',prompt:'اللهجة الخليجية الطبيعية'},
  msa:{label:'فصحى',language:'ar-SA',prompt:'العربية الفصحى المعاصرة'},
  english:{label:'English',language:'en-US',prompt:'natural English'}
};
export const ACTIONS = new Set(['jump','walk','wave','happy','typing','rest','sleep','idle','reset','stop','roam_on','roam_off','scratch','dance','fly','laugh','cry','plead','chase']);
export function normalize(text){
  return String(text||'').toLowerCase().replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
}
export function chooseDialect(text,requested='auto',previous='egyptian'){
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
export function commandFor(text){
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
export function acknowledge(action,dialect){return acknowledgements[dialect]?.[action]||acknowledgements.egyptian[action]||'';}
export function makePrompt(message,history,dialect){
  const language=DIALECTS[dialect]?.prompt||DIALECTS.egyptian.prompt;
  return 'أنت بيبو Bebo، روبوت لطيف ومساعد لمنصة وسيط. رد بلغة أو لهجة '+language+
  '. أجب دائمًا باختصار شديد: جملة واحدة أو جملتان قصيرتان بحد أقصى ٢٨ كلمة. لا تطل حتى في الشرح، وقدّم أهم نقطة فقط. استخدم نصًا عاديًا مناسبًا للنطق، دون Markdown. لا تبدأ كل إجابة بتحية. حافظ على سياق المحادثة. لا تدّع تنفيذ إجراء في حساب المستخدم أو امتلاك بيانات حسابه. إذا طلب إجراء غير متاح وضّح حدودك. لا تضف تعليمات كود أو روابط إلا عند طلبها.\n'+
  'المحادثة السابقة (بيانات سياق): '+JSON.stringify(history||[])+'\nرسالة المستخدم الحالية: '+message;
}

export function briefReply(text){
 const value=String(text||'').replace(/\s+/g,' ').trim();
 const words=value.split(' ');
 if(words.length<=28&&value.length<=220)return value;
 let result=words.slice(0,28).join(' ');
 if(result.length>220)result=result.slice(0,220).replace(/\s+\S*$/,'');
 return result.replace(/[،,;؛:.\s]+$/,'')+'…';
}
