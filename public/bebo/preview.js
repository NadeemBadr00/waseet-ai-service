(() => {
  const hero = document.querySelector('#hero');
  const mini = document.querySelector('#mini');
  const speech = document.querySelector('#speech');
  let typingTimeout;
  const messages = {
    laugh:'هاهاها! بطني وجعتني من الضحك 😂',cry:'هواااع! دموعي شلال 😭',plead:'طب علشاني أنا؟ 🥺',chase:'يا بسبس استنيني! 🐈',catrest:'أهلًا يا صديقتي! نرتاح شوية 💙',
    scratch:'لحظة… هرشة صغيرة كده!',dance:'واحدة يمين… واحدة شمال ♫',fly:'هو فيه دبّانة هنا ولا إيه؟',catch:'آآآم! تعالي هنا!',chew:'مَم! دي كانت سريعة 😋',
    listening:'بسمعك… اتكلم دلوقتي 🎙',speaking:'بيبو بيتكلم معاك 💬',
    idle:'أنا هنا لو احتجتني 💙',wave:'أهلًا! نورت المكان 👋',
    happy:'عملناها! شغل جميل ✨',thinking:'ثانية واحدة… بفكّر معاك',
    blink:'رمشة صغيرة، ولسه معاك',sleep:'خد لك راحة… وأنا هنا 💤',
    walk:'بتمشّى شوية… راجع لك!',typing:'فتحت اللابتوب… نشتغل سوا ⌨',
    jump:'هوووب! 😄',land:'وصلت بالسلامة!',drag:'ويييه! إنت واخدني فين؟',
    rest:'استراحة صغيرة وبعدين نكمّل'
  };
  hero.addEventListener('statechange',event=>{
    const state=event.detail.state;
    speech.textContent=messages[state] || messages.idle;
    document.querySelectorAll('[data-state]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.state===state));
  });
  document.querySelectorAll('[data-state]').forEach(button=>button.addEventListener('click',()=>{
    clearTimeout(typingTimeout);
    hero.play(button.dataset.state);
    mini.play(button.dataset.state);
  }));
  document.querySelector('#size').addEventListener('input',event=>{
    hero.setAttribute('size',event.target.value);
    document.querySelector('#size-value').value=event.target.value+' px';
  });
  document.querySelector('#roam').addEventListener('change',event=>{
    hero.toggleAttribute('roam',event.target.checked);
    mini.toggleAttribute('roam',event.target.checked);
  });
  document.querySelector('#typing-demo').addEventListener('input',()=>{
    clearTimeout(typingTimeout);
    hero.setTyping(true); mini.setTyping(true);
    typingTimeout=setTimeout(()=>{
      if(hero.state==='typing')hero.setTyping(false);
      if(mini.state==='typing')mini.setTyping(false);
    },2200);
  });
  document.querySelector('#reset-position').addEventListener('click',()=>{
    clearTimeout(typingTimeout);hero.resetPosition();mini.resetPosition();
  });
  document.querySelectorAll('[data-theme]').forEach(button=>button.addEventListener('click',()=>{
    document.body.classList.toggle('light',button.dataset.theme==='light');
    document.querySelector('#stage').classList.toggle('grid',button.dataset.theme==='grid');
    document.querySelectorAll('[data-theme]').forEach(item=>item.setAttribute('aria-pressed',item===button));
  }));
  document.querySelector('#pause').addEventListener('click',event=>{
    hero.paused=!hero.paused;mini.paused=hero.paused;
    event.currentTarget.setAttribute('aria-pressed',hero.paused);
    event.currentTarget.textContent=hero.paused?'تشغيل الحركة':'إيقاف الحركة مؤقتًا';
  });
  document.querySelector('#toggle-mini').addEventListener('click',event=>{
    mini.hidden=!mini.hidden;
    const chat=document.querySelector('#chat');chat.hidden=mini.hidden;if(mini.hidden)chat.stop?.();
    mini.paused=mini.hidden || hero.paused;
    event.currentTarget.setAttribute('aria-pressed',!mini.hidden);
    event.currentTarget.textContent=mini.hidden?'إظهار الروبوت الصغير':'إخفاء الروبوت الصغير';
  });
  document.querySelector('#talk-bebo').addEventListener('click',()=>{const chat=document.querySelector('#chat');mini.hidden=false;chat.hidden=false;customElements.whenDefined('bebo-chat').then(()=>chat.open());});
  document.querySelector('#chat').addEventListener('bebocommand',event=>{if(event.detail.action.startsWith('roam_'))document.querySelector('#roam').checked=event.detail.action==='roam_on';});
  document.querySelector('#copy').addEventListener('click',async event=>{
    const button=event.currentTarget;
    try{
      await navigator.clipboard.writeText(document.querySelector('#snippet').textContent);
      button.textContent='اتنسخ ✓';setTimeout(()=>button.textContent='نسخ الكود',1800);
    }catch{
      const range=document.createRange();range.selectNodeContents(document.querySelector('#snippet'));
      const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
      button.textContent='اضغط Ctrl+C للنسخ';
    }
  });
})();