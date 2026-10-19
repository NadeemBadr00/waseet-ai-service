/* Bebo v4 — pixel companion. No dependencies. */
(() => {
  'use strict';
  if (customElements.get('cute-robot') && customElements.get('khaled-guide-robot')) return;
  const base = document.currentScript?.src || document.baseURI;
    const classicAssets = {
    base: new URL('robot-sprites.png', base).href,
    action: new URL('robot-actions.png', base).href,
    speech: new URL('robot-speaking.png', base).href,
    antics: new URL('robot-antics.png', base).href,
    emotions: new URL('robot-emotions.png', base).href,
    cat: new URL('kitten-sprites.png', base).href,
    traffic: new URL('scout/guide-traffic.png', base).href,
    expressions: new URL('scout/guide-expressions.png', base).href
  };
  const scoutAssets = {
    base: new URL('scout/guide-sprites.png', base).href,
    action: new URL('scout/guide-actions.png', base).href,
    speech: new URL('scout/guide-speaking.png', base).href,
    antics: new URL('scout/guide-antics.png', base).href,
    emotions: new URL('scout/guide-emotions.png', base).href,
    cat: new URL('scout/kitten-sprites.png', base).href,
    traffic: new URL('scout/guide-traffic.png', base).href,
    expressions: new URL('scout/guide-expressions.png', base).href
  };
  const poses = {
    idle: { frames: [0], label: 'مستني معاك' },
    blink: { frames: [1], label: 'بيرمش', duration: 160 },
    wave: { frames: [2,3], label: 'بيسلّم', step: 210, duration: 2100 },
    happy: { frames: [4,5], label: 'فرحان', step: 325, duration: 2000 },
    thinking: { frames: [6], label: 'بيفكّر' },
    listening: { frames: [0], label: 'بيسمعك' },
    speaking: { atlas:'speech', frames:[0,1,2,3,4,5,4,3,2,6,7], label:'بيتكلم وبيشرح', step:440 },
    scratch: {atlas:'antics',frames:[0,1,1,1,1,0],label:'بيهرش راسه',step:650,duration:3900},
    dance: {atlas:'antics',frames:[2,3],label:'بيرقص',step:700,duration:5600},
    fly: {atlas:'antics',frames:[4,4,5,4],label:'بيتابع الدبانة',step:1450,duration:5800},
    catch: {atlas:'antics',frames:[5,6,6],label:'بيمسك الدبانة',step:420,duration:1260},
    chew: {atlas:'antics',frames:[7],label:'أكل الدبانة وفرحان',duration:2400},
    laugh: {atlas:'emotions',frames:[0,1],label:'بيضحك من قلبه',step:600,duration:4800},
    cry: {atlas:'emotions',frames:[2,3],label:'بيعيّط عياط كرتوني',step:550,duration:5500},
    plead: {atlas:'emotions',frames:[4,5],label:'بيعمل عيون قطط وصعبانيات',step:1400,duration:5600},
    chase: {atlas:'emotions',frames:[6,7],label:'بيجري ورا القطة',step:240,duration:10500},
    catrest: {frames:[2,3],label:'بيسلّم على القطة',step:800,duration:2800},
    drive: {atlas:'traffic',frames:[0,1],label:'بيسوق عربيته بالحزام',step:750,duration:6000},
    crash: {atlas:'traffic',frames:[2,3,3,3],label:'بيمثل خبطة كرتونية بسيطة',step:850,duration:3400},
    seatbelt: {atlas:'traffic',frames:[4,4,5,5],label:'بيربط حزام الأمان',step:900,duration:3600},
    traffic: {atlas:'traffic',frames:[6,7],label:'بينظم المرور عند الإشارة',step:2400,duration:4800},
    crosswalk: {atlas:'action',frames:[0,1],label:'بيعبر عند خطوط المشاة',step:340,duration:5000},
    map: {atlas:'speech',frames:[3,4,3,3],label:'بيفرد خريطة وبيشير للمسار',step:1050,duration:4200},
    report: {atlas:'speech',frames:[2,3,2,2],label:'بيراجع تقرير وبيعلّم عليه',step:1150,duration:4600},
    chart: {atlas:'speech',frames:[3,4,4,3],label:'بيشرح رسم بياني صغير',step:1100,duration:4400},
    amazed: {atlas:'expressions',frames:[0,1],label:'مندهش ومتحمس',step:1000,duration:4400},
    whisper: {atlas:'expressions',frames:[2,3],label:'بيهمس بهدوء',step:1100,duration:4600},
    shout: {atlas:'expressions',frames:[4,5],label:'بينادي بصوت عالي',step:950,duration:4200},
    idea: {atlas:'expressions',frames:[6,7],label:'عنده فكرة وبيشرحها',step:1050,duration:4500},
    sleep: { frames: [7], label: 'نعسان' },
    walk: { atlas: 'action', frames: [0,1], label: 'بيمشي', step: 140 },
    typing: { atlas: 'action', frames: [2,3], label: 'بيكتب على اللابتوب', step: 170 },
    jump: { atlas: 'action', frames: [4], label: 'بينط', duration: 680 },
    land: { atlas: 'action', frames: [5], label: 'بينزل', duration: 200 },
    drag: { atlas: 'action', frames: [6], label: 'مرفوع بالماوس' },
    rest: { atlas: 'action', frames: [7], label: 'قاعد يرتاح' }
  };
  const STYLE = "\n:host{display:inline-block;width:var(--robot-size,128px);height:var(--robot-size,128px);vertical-align:middle;contain:layout style;user-select:none;-webkit-user-select:none}\n:host([movable]),:host([floating]){position:absolute;left:0;top:0;transform:translate3d(var(--robot-x,0px),var(--robot-y,0px),0);will-change:transform}\n:host([floating]){position:fixed;z-index:1000}\n*{box-sizing:border-box}\nbutton{position:relative;display:block;width:100%;height:100%;border:0;padding:0;background:none;color:inherit;border-radius:25%;cursor:default;-webkit-tap-highlight-color:transparent;touch-action:manipulation}\n:host([interactive]) button{cursor:pointer}\n:host([movable]) button,:host([floating]) button{cursor:grab;touch-action:none}\n:host([data-dragging]) button{cursor:grabbing}\nbutton:focus-visible{outline:2px solid #83a5ff;outline-offset:3px}\n.facing,.sprite{width:100%;height:100%;pointer-events:none}\n.facing{transform:scaleX(var(--robot-facing,1))}\n.sprite{position:relative;background-size:400% 200%;background-repeat:no-repeat;image-rendering:pixelated;transform-origin:50% 86%;will-change:transform}\n.shadow{position:absolute;width:42%;height:4%;left:29%;bottom:5%;background:#0003;border-radius:50%;filter:blur(3px);pointer-events:none}\n.idle .sprite,.thinking .sprite{animation:bebo-float 3s ease-in-out infinite}\n.wave .sprite{animation:bebo-wave .7s ease-in-out infinite}\n.happy .sprite{animation:bebo-happy .65s ease-in-out infinite}\n.walk .sprite{animation:bebo-step .28s linear infinite}\n.typing .sprite{animation:bebo-type .5s ease-in-out infinite}\n.jump .sprite{animation:bebo-jump .68s cubic-bezier(.35,0,.3,1) both}\n.land .sprite{animation:bebo-land .2s ease-out both}\n.drag .sprite{transform-origin:50% 12%;animation:bebo-dangle .6s ease-in-out infinite}\n.drag .shadow{opacity:0}\n.sleep .sprite,.rest .sprite{animation:bebo-breathe 4s ease-in-out infinite}\n.jump .shadow{animation:bebo-shadow .68s ease-in-out both}\n.still .sprite,.still .shadow{animation-play-state:paused!important;will-change:auto}\n.reduced .sprite,.reduced .shadow{animation:none!important}\n@keyframes bebo-float{50%{transform:translateY(-2%)}}\n@keyframes bebo-wave{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg) translateY(-2%)}}\n@keyframes bebo-happy{0%,100%{transform:scale(1.02,.98)}50%{transform:translateY(-7%) scale(.98,1.02)}}\n@keyframes bebo-step{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-.8%) rotate(.6deg)}}\n@keyframes bebo-type{50%{transform:translateY(1%)}}\n@keyframes bebo-jump{0%{transform:scale(1.06,.94)}42%{transform:translateY(-23%) scale(.98,1.02)}100%{transform:translateY(0)}}\n@keyframes bebo-land{0%{transform:scale(1.1,.9)}100%{transform:scale(1)}}\n@keyframes bebo-dangle{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}\n@keyframes bebo-breathe{50%{transform:scale(1.012,.988)}}\n@keyframes bebo-shadow{45%{transform:scale(.55);opacity:.4}100%{transform:scale(1);opacity:1}}\n@media(prefers-reduced-motion:reduce){.sprite,.shadow{animation:none!important;will-change:auto}}\n";
  const COMM_STYLE = '.speaking .sprite{animation:bebo-talk 1.8s ease-in-out infinite}.listening .sprite{animation:bebo-listen 1.8s ease-in-out infinite}.listening:after{content:"";position:absolute;inset:9%;border:1px solid #a0c0ff88;border-radius:50%;pointer-events:none;animation:bebo-ring 1.2s ease-out infinite}.listening:after{border-color:#ffb7c788}@keyframes bebo-talk{50%{transform:translateY(-2%) rotate(1deg)}}@keyframes bebo-listen{50%{transform:rotate(-4deg)}}@keyframes bebo-ring{0%{opacity:.8;transform:scale(.9)}100%{opacity:0;transform:scale(1.2)}}.still:after{animation-play-state:paused}.reduced:after{animation:none}@media(prefers-reduced-motion:reduce){.speaking .sprite,.listening .sprite,.speaking:after,.listening:after{animation:none!important}}';

  const ANTICS_STYLE = '.sprite{backface-visibility:hidden}.scratch .sprite{animation:bebo-scratch 1.2s ease-in-out infinite}.dance .sprite{animation:bebo-dance 1.4s ease-in-out infinite}.fly .sprite{animation:bebo-watch 2.8s ease-in-out infinite}.catch .sprite{animation:bebo-nom 1.2s ease-in-out both}.chew .sprite{animation:bebo-chew 1.3s ease-in-out infinite}.bug{display:none;position:absolute;left:76%;top:30%;width:10%;height:9%;min-width:9px;min-height:8px;pointer-events:none;z-index:2;transform:translate(-50%,-50%)}.bug svg{width:100%;height:100%;overflow:visible;filter:drop-shadow(0 1px 1px #0007)}.fly .bug,.catch .bug{display:block}.fly .bug{animation:bebo-bug-orbit 5.8s ease-in-out both}.catch .bug{animation:bebo-bug-catch 1.25s ease-in-out both}.bug .wings{transform-origin:12px 10px;animation:bebo-wings .15s ease-in-out infinite}.nom{position:absolute;display:none;left:62%;top:42%;font:700 max(9px,calc(var(--robot-size) * .1)) Tahoma,sans-serif;color:#bceefc;text-shadow:1px 1px #172f68;pointer-events:none}.chew .nom{display:block;animation:bebo-yum 2.2s ease-out both}.still .bug,.still .wings,.still .nom{animation-play-state:paused!important}.reduced .bug,.reduced .wings,.reduced .nom{animation:none!important}.reduced.catch .bug{display:none}@keyframes bebo-scratch{0%,100%{transform:rotate(-1deg)}50%{transform:rotate(1.6deg) translateY(-.5%)}}@keyframes bebo-dance{0%,100%{transform:translateX(-2%) rotate(-3deg)}25%{transform:translateX(0) translateY(-1.5%)}50%{transform:translateX(2%) rotate(3deg)}75%{transform:translateX(0) translateY(-1.5%)}}@keyframes bebo-watch{50%{transform:rotate(-2deg)}}@keyframes bebo-nom{0%,100%{transform:scale(1)}48%{transform:translateY(-2%) scale(1.025,1.01)}75%{transform:scale(1.015,.99)}}@keyframes bebo-chew{50%{transform:scale(1.015,.99)}}@keyframes bebo-bug-orbit{0%{left:84%;top:28%;transform:translate(-50%,-50%) rotate(-15deg)}18%{left:68%;top:9%;transform:translate(-50%,-50%) rotate(-40deg)}36%{left:16%;top:22%;transform:translate(-50%,-50%) rotate(-125deg)}54%{left:29%;top:39%;transform:translate(-50%,-50%) rotate(-10deg)}75%{left:82%;top:14%;transform:translate(-50%,-50%) rotate(30deg)}100%{left:76%;top:33%;transform:translate(-50%,-50%) rotate(15deg)}}@keyframes bebo-bug-catch{0%,22%{left:76%;top:33%;opacity:1;transform:translate(-50%,-50%) scale(1)}62%{left:51%;top:56%;opacity:1;transform:translate(-50%,-50%) scale(.75)}74%,100%{left:50%;top:58%;opacity:0;transform:translate(-50%,-50%) scale(.1)}}@keyframes bebo-wings{50%{transform:scaleX(.6) rotate(12deg)}}@keyframes bebo-yum{0%{opacity:0;transform:translateY(3px)}25%,70%{opacity:1}100%{opacity:0;transform:translateY(-7px)}}@media(prefers-reduced-motion:reduce){.bug,.wings,.nom{animation:none!important}.catch .bug{display:none}}';


  const EMOTION_STYLE = '.laugh .sprite{animation:bebo-laugh 1.2s ease-in-out infinite}.cry .sprite{animation:bebo-sob 1.1s ease-in-out infinite}.plead .sprite{animation:bebo-plead 3s ease-in-out infinite}.chase .sprite{animation:bebo-run .48s ease-in-out infinite}.catrest .sprite{animation:bebo-wave 1.6s ease-in-out infinite}.teardrop{position:absolute;display:none;top:53%;width:4%;height:7%;border-radius:65% 35% 65% 35%;background:#60eeff;border:1px solid #a0ffff;box-shadow:0 0 6px #72e6ff66;pointer-events:none;opacity:0}.teardrop.left{left:29%}.teardrop.right{right:29%;animation-delay:.42s!important}.cry .teardrop{display:block;animation:bebo-tear 1.15s ease-in infinite}.kitten{display:none;position:absolute;top:var(--cat-y,40%);left:var(--cat-x,70%);width:var(--cat-size,64%);height:var(--cat-size,64%);pointer-events:none;z-index:1;transform:scaleX(var(--cat-facing,1));transform-origin:center;contain:layout style}.cat-sprite{width:100%;height:100%;background-size:400% 200%;background-repeat:no-repeat;image-rendering:pixelated;transform-origin:50% 87%}.chase .kitten,.catrest .kitten{display:block}.chase .cat-sprite{animation:bebo-cat-run .5s ease-in-out infinite}.catrest .cat-sprite{animation:bebo-cat-rest 2s ease-in-out infinite}.still .teardrop,.still .cat-sprite{animation-play-state:paused!important}.reduced .teardrop{display:none}.reduced .cat-sprite{animation:none!important}@keyframes bebo-laugh{0%,100%{transform:rotate(-1.5deg)}24%{transform:translateY(-1.5%) scale(1.015,.985) rotate(1deg)}48%{transform:translateY(0) rotate(-1deg)}72%{transform:translateY(-1%) scale(1.01,.99) rotate(1.5deg)}}@keyframes bebo-sob{0%,100%{transform:rotate(-2deg)}40%{transform:translateY(1%) scale(1.025,.98) rotate(2deg)}70%{transform:translateY(-.7%) rotate(-1deg)}}@keyframes bebo-plead{0%,100%{transform:rotate(-1deg)}50%{transform:translateY(-1%) rotate(1deg)}}@keyframes bebo-run{50%{transform:translateY(-3%) rotate(1deg)}}@keyframes bebo-cat-run{50%{transform:translateY(-2%)}}@keyframes bebo-cat-rest{50%{transform:scale(1.01,.99)}}@keyframes bebo-tear{0%{opacity:0;transform:translateY(0) scale(.65)}18%{opacity:1}78%{opacity:.85}100%{opacity:0;transform:translateY(calc(var(--robot-size) * .37)) scale(.5)}}@media(prefers-reduced-motion:reduce){.teardrop{display:none!important}.cat-sprite{animation:none!important}}';

  const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
  class CuteRobot extends HTMLElement {
    static observedAttributes = ['state','size','sprite','actions','paused','interactive','movable','floating','roam','floor-offset','speaking-sprite','home-x','antics-sprite','emotions-sprite','cat-sprite','traffic-sprite','expressions-sprite','brand-logo','skin','label'];
    get skin() {
      return this.getAttribute('skin') || 'classic';
    }
    _activeAssets() {
      return (this.skin === 'scout' || this.skin === 'safety') ? scoutAssets : classicAssets;
    }
    _advanceRoadScene() {
      if(!this.movable || this._motion.matches)return;
      const lim=this._limits();
      if(!this._roadScene){
        const direction=this._x<(lim.minX+lim.maxX)/2?1:-1;
        const distance=Math.min(this.state==='drive'?190:130,(lim.maxX-lim.minX)*.65);
        this._roadScene={start:this._x,target:clamp(this._x+direction*distance,lim.minX,lim.maxX),direction};
        this._face(direction);
      }
      const scene=this._roadScene;
      const progress=clamp(this._elapsed/Math.max(1,this._duration||5000),0,1);
      const smooth=progress*progress*(3-2*progress);
      this._x=clamp(scene.start+(scene.target-scene.start)*smooth,lim.minX,lim.maxX);
      this._y=lim.maxY;this._place();
    }
    constructor() {
      super();
      this._x = 0; this._y = 0; this._elapsed = 0; this._idleTime = 0;
      this._walkTarget = null; this._visible = true; this._raf = 0;
      this._returnState = 'idle'; this._duration = 0;
      this._motion = matchMedia('(prefers-reduced-motion: reduce)');
      this._onEnvironment = () => {
        if (this._motion.matches && this._falling) this._finishFall(false);
        if (this._motion.matches && this._walkTarget !== null) {
          this._x = this._walkTarget; this._walkTarget = null; this._place(); this._setPose('idle');
        }
        if (this._motion.matches && ['jump','land'].includes(this.state)) this._setPose(this._returnState,{loop:true});
        this._refresh();
      };
      this._onResize = () => this._layout();
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = '<style>' + STYLE + COMM_STYLE + ANTICS_STYLE + EMOTION_STYLE + '</style><button type="button"><span class="shadow"></span><div class="facing"><div class="sprite" aria-hidden="true"></div><span class="bug" aria-hidden="true"><svg viewBox="0 0 24 20"><g class="wings" fill="#dff4ff" stroke="#5c7899" stroke-width=".7"><ellipse cx="8" cy="6" rx="5.5" ry="3.5" transform="rotate(-25 8 6)"/><ellipse cx="16" cy="6" rx="5.5" ry="3.5" transform="rotate(25 16 6)"/></g><ellipse cx="12" cy="11" rx="4" ry="6" fill="#3c4757" stroke="#c5d8ee" stroke-width=".8"/><circle cx="10" cy="8" r="1.2" fill="#ffcf98"/><circle cx="14" cy="8" r="1.2" fill="#ffcf98"/><path d="m8 12-3 2m11-2 3 2M8 15l-2 2m10-2 2 2" stroke="#a2b4cc" stroke-width="1"/></svg></span><span class="nom" aria-hidden="true">مَم!</span><span class="teardrop left" aria-hidden="true"></span><span class="teardrop right" aria-hidden="true"></span></div><span class="kitten" aria-hidden="true"><span class="cat-sprite" style="display:block"></span></span></button>';
      this._button = this.shadowRoot.querySelector('button');
      this._sprite = this.shadowRoot.querySelector('.sprite');
      this._catSprite = this.shadowRoot.querySelector('.cat-sprite');
      this._button.addEventListener('pointerdown', event => this._down(event));
      this._button.addEventListener('pointermove', event => this._move(event));
      this._button.addEventListener('pointerup', event => this._up(event));
      this._button.addEventListener('pointercancel', event => this._up(event, true));
      this._button.addEventListener('lostpointercapture', event => this._up(event, true));
      this._button.addEventListener('dragstart', event => event.preventDefault());
      this._button.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'touch' && this.hasAttribute('interactive') &&
            !this._pointer && !this.paused && !this._motion.matches &&
            performance.now() - (this._lastHover || -2000) > 1400 &&
            !['jump','land','drag','listening','speaking','thinking','scratch','dance','fly','catch','chew','laugh','cry','plead','chase','catrest'].includes(this.state)) {
          this._lastHover = performance.now();
          this.jump();
        }
      });
      this._button.addEventListener('click', () => {
        if (this.hasAttribute('interactive') && performance.now() > (this._suppressClickUntil || 0)) this.play('wave');
      });
      this._button.addEventListener('keydown', event => {
        if (!this.hasAttribute('interactive') && !this.movable) return;
        if (event.key === 'ArrowUp') { event.preventDefault(); this.jump(); }
        else if (event.key === 'Escape' && this.movable) { this.resetPosition(); }
        else if (this.movable && ['ArrowLeft','ArrowRight'].includes(event.key)) {
          event.preventDefault(); this.walkTo(this._x + (event.key === 'ArrowRight' ? 64 : -64));
        }
      });
    }
    connectedCallback() {
      this._motion.addEventListener('change', this._onEnvironment);
      document.addEventListener('visibilitychange', this._onEnvironment);
      window.addEventListener('resize', this._onResize);
      this._observer = new IntersectionObserver(entries => {
        this._visible = entries[0].isIntersecting; this._refresh();
      });
      this._observer.observe(this);
      this._resizeObserver = new ResizeObserver(this._onResize);
      if (this.parentElement) this._resizeObserver.observe(this.parentElement);
      this._layout(); this._refresh();
    }
    disconnectedCallback() {
      this._up(null, true);
      cancelAnimationFrame(this._raf); this._raf = 0; this._lastTime = 0;
      this._observer?.disconnect(); this._resizeObserver?.disconnect();
      this._motion.removeEventListener('change', this._onEnvironment);
      document.removeEventListener('visibilitychange', this._onEnvironment);
      window.removeEventListener('resize', this._onResize);
    }
    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue) return;
      if (name === 'skin') {
        this._image = null;
        this._frameKey = null;
        this._paint();
        this._refresh();
        return;
      }
      if (name === 'state') {
        if(this.state!=='catrest')this._chase=null;
        this._elapsed = 0; this._idleTime = 0; this._duration = poses[this.state].duration || 0;
        this._speechFrame=0;this._speechFrameAt=-440;this._speechFiltered=0;
        this._blinkAt = 2200 + Math.random() * 2400;
      }
      if (!this.isConnected) return;
      if (['size','movable','floating','floor-offset'].includes(name)) this._layout();
      this._refresh();
    }
    get state() { return Object.hasOwn(poses, this.getAttribute('state')) ? this.getAttribute('state') : 'idle'; }
    get movable() { return this.hasAttribute('movable') || this.hasAttribute('floating'); }
    get paused() { return this.hasAttribute('paused'); }
    set paused(value) { this.toggleAttribute('paused', Boolean(value)); }
    get position() { return { x: this._x, y: this._y }; }
    _emit(type, detail = {}) {
      this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    }
    _setPose(state, { duration, loop = false, resume = 'idle' } = {}) {
      this._returnState = resume;
      if(state==='chase')this._chase=null;
      if(state==='speaking'){this._speechFrameAt=-440;this._speechFrame=0;this._speechFiltered=0;}
      this.setAttribute('state', state);
      this._elapsed = 0; this._idleTime = 0;
      this._duration = loop ? 0 : (duration ?? poses[state].duration ?? 0);
      this._paint(); this._refresh();
    }
    play(state = 'idle', options = {}) {
      if (!Object.hasOwn(poses, state)) throw new TypeError('Unknown robot state: ' + state);
      if (this._pointer?.dragged) return this;
      if (state === 'walk' && this.movable) {
        const lim = this._limits();
        return this.walkTo(this._x < (lim.minX + lim.maxX) / 2 ? lim.maxX : lim.minX);
      }
      if (state === 'jump') return this.jump();
      this._walkTarget = null; this._falling = false; this._roadScene = null;
      if (this.movable) { this._y = this._limits().maxY; this._place(); }
      this._setPose(state, options);
      return this;
    }
    setTyping(value = true) { return this.play(value ? 'typing' : 'idle'); }
    jump() {
      if (this._pointer?.dragged || this.paused || this._motion.matches ||
          ['jump','land','drag'].includes(this.state)) return this;
      this._setPose('jump', { resume: this.state });
      this._emit('robotjump');
      return this;
    }
    walkTo(x) {
      if (!Number.isFinite(x)) throw new TypeError('walkTo requires a finite x coordinate');
      if (!this.movable) { this._setPose('walk', { loop: true }); return this; }
      const lim = this._limits();
      this._walkTarget = clamp(x, lim.minX, lim.maxX);
      this._falling = false; this._y = lim.maxY;
      if (this._motion.matches || Math.abs(this._walkTarget - this._x) < 1) {
        this._x = this._walkTarget; this._walkTarget = null; this._place();
        this._setPose('idle'); return this;
      }
      this._face(this._walkTarget >= this._x ? 1 : -1);
      this._setPose('walk', { loop: true });
      this._emit('robotwalkstart', { targetX: this._walkTarget });
      return this;
    }
    resetPosition() {
      this._walkTarget = null; this._falling = false; this._positioned = false;
      this._layout(); this._setPose('idle'); return this;
    }
    setMovementBounds(bounds = null) {
      if (bounds && !['minX','minY','maxX','maxY'].every(key => Number.isFinite(bounds[key]))) {
        throw new TypeError('Movement bounds require finite coordinates');
      }
      const next = bounds ? { ...bounds } : null;
      const previous = this._movementBounds;
      if ((!next && !previous) || (next && previous && ['minX','minY','maxX','maxY'].every(key => next[key] === previous[key]))) return this;
      this._movementBounds = next;
      if (this.isConnected) this._layout();
      return this;
    }
    _limits() {
      const floating = this.hasAttribute('floating');
      const parent = this.offsetParent || this.parentElement;
      const width = floating ? document.documentElement.clientWidth : (parent?.clientWidth || 320);
      const height = floating ? window.innerHeight : (parent?.clientHeight || 320);
      const pad = floating ? 12 : 0;
      const dockOffset = floating ? 54 : 0;
      if (floating && this._movementBounds) {
        const bounds = this._movementBounds;
        const minX = clamp(bounds.minX,0,Math.max(0,width-this._size));
        const minY = clamp(bounds.minY,0,Math.max(0,height-this._size));
        return { minX,minY,maxX:clamp(bounds.maxX,minX,Math.max(minX,width-this._size)),maxY:clamp(bounds.maxY,minY,Math.max(minY,height-this._size)) };
      }
      return { minX:pad,minY:pad,maxX:Math.max(pad,width-this._size-pad),maxY:Math.max(pad,height-this._size-pad-dockOffset-(floating?Math.max(0,Number(this.getAttribute('floor-offset'))||0):0)) };
    }
    _layout() {
      const requested = Number(this.getAttribute('size')) || 128;
      this._size = clamp(requested, 32, 512);
      this.style.setProperty('--robot-size', this._size + 'px');
      if (!this.movable) return;
      // Fit very small containers without leaving the viewport.
      const parent = this.offsetParent || this.parentElement;
      const maxWidth = this.hasAttribute('floating') ? document.documentElement.clientWidth - 24 : parent?.clientWidth;
      const maxHeight = this.hasAttribute('floating') ? window.innerHeight - 24 : parent?.clientHeight;
      if (maxWidth > 0 && maxHeight > 0) {
        this._size = Math.max(1, Math.min(this._size, maxWidth, maxHeight));
        this.style.setProperty('--robot-size', this._size + 'px');
      }
      const lim = this._limits();
      if (!this._positioned) {
        this._x = this.hasAttribute('floating') ? clamp(Number(this.getAttribute('home-x'))||lim.minX,lim.minX,lim.maxX) : (lim.minX + lim.maxX) / 2;
        this._y = lim.maxY; this._positioned = true;
      } else {
        this._x = clamp(this._x, lim.minX, lim.maxX);
        this._y = this._pointer?.dragged || this._falling ? clamp(this._y,lim.minY,lim.maxY) : lim.maxY;
      }
      if (this._walkTarget !== null) this._walkTarget = clamp(this._walkTarget,lim.minX,lim.maxX);
      this._place();this._paintKitten();
    }
    _place() {
      this.style.setProperty('--robot-x', this._x.toFixed(2) + 'px');
      this.style.setProperty('--robot-y', this._y.toFixed(2) + 'px');
      this._emit('robotmove',this.position);
    }
    _face(direction) { this.style.setProperty('--robot-facing', String(direction)); }
    _down(event) {
      if (!this.movable || event.button !== 0 || event.isPrimary === false || this._pointer) return;
      this._pointer = { id:event.pointerId,startX:event.clientX,startY:event.clientY,x:this._x,y:this._y,dragged:false };
      try { this._button.setPointerCapture(event.pointerId); } catch {}
      // Only movable robots claim touch gestures. The rest of the page still scrolls.
      event.preventDefault();
    }
    _move(event) {
      const p = this._pointer;
      if (!p || p.id !== event.pointerId) return;
      const dx = event.clientX - p.startX, dy = event.clientY - p.startY;
      if (!p.dragged && Math.hypot(dx,dy) < 5) return;
      if (!p.dragged) {
        p.dragged = true; this._walkTarget = null; this._falling = false;
        this.setAttribute('data-dragging',''); this._face(1);
        this._setPose('drag', { loop:true });
        this._emit('robotdragstart',this.position);
      }
      const lim = this._limits();
      this._x = clamp(p.x+dx,lim.minX,lim.maxX); this._y = clamp(p.y+dy,lim.minY,lim.maxY);
      this._dragDirection = dx >= 0 ? 1 : -1;
      this._place();
    }
    _up(event, cancelled = false) {
      const p = this._pointer;
      if (!p || (event && p.id !== event.pointerId)) return;
      this._pointer = null;
      try { if (this._button.hasPointerCapture(p.id)) this._button.releasePointerCapture(p.id); } catch {}
      this.removeAttribute('data-dragging');
      if (!p.dragged) return;
      this._suppressClickUntil = performance.now() + 450;
      this._emit('robotdrop', { ...this.position, cancelled });
      this._falling = !this._motion.matches && !this.paused && this.isConnected && !cancelled;
      this._velocityY = 0;
      this._afterDropWalk = this._falling;
      if (this._falling) {
        this._setPose('drag', { loop:true });
        if (this._y >= this._limits().maxY) this._finishFall(true);
      } else this._finishFall(false);
    }
    _finishFall(animate) {
      this._falling = false; this._y = this._limits().maxY; this._place();
      if (animate) {
        const lim = this._limits();
        const distance = Math.min(72, (lim.maxX-lim.minX)*.5);
        let target = this._x + (this._dragDirection || 1)*distance;
        if (target > lim.maxX || target < lim.minX) target = this._x - (this._dragDirection || 1)*distance;
        this._walkTarget = clamp(target,lim.minX,lim.maxX);
        this._setPose('land', { resume:'walk' });
      } else { this._walkTarget = null; this._setPose('idle'); }
      this._emit('robotland',this.position);
    }
    _refresh() {
      const state = this.state;
      const interactive = this.hasAttribute('interactive');
      this._button.tabIndex = interactive || this.movable ? 0 : -1;
      this._button.setAttribute('role',interactive || this.movable ? 'button' : 'img');
      this._button.setAttribute('aria-label',(this.getAttribute('label') || 'بيبو') + '، ' + poses[state].label +
        (this.movable ? '، اسحب لتحريكه أو استخدم الأسهم، سهم لأعلى للنط' : ''));
      const stopped = this.paused || document.hidden || !this._visible;
      this._button.className = state + (stopped ? ' still' : '') + (this._motion.matches ? ' reduced' : '');
      this._paint();
      if (this._lastState !== state) {
        this._lastState = state; this._paint();
        this._emit('statechange',{state});
      }
      if (!this.isConnected || stopped) {
        cancelAnimationFrame(this._raf); this._raf = 0; this._lastTime = 0;
      } else if (!this._raf) this._raf = requestAnimationFrame(time => this._tick(time));
    }

    _catBounds() {
      const lim=this.movable?this._limits():{minX:0,maxX:0};
      const width=lim.maxX-lim.minX+this._size;
      const size=Math.max(1,Math.min(this._size*.66,width*.32));
      return {left:lim.minX,right:Math.max(lim.minX,lim.maxX+this._size-size),size};
    }
    _startChase() {
      const bounds=this._catBounds(),x=this.movable?this._x:0;
      const direction=x+this._size/2<(bounds.left+bounds.right+bounds.size)/2?1:-1;
      this._chase={x:clamp(x+(direction>0?this._size*.9:-bounds.size*.9),bounds.left,bounds.right),direction,velocity:0,robotVelocity:0};
    }
    _advanceChase(dt) {
      if(!this._chase)this._startChase();
      const c=this._chase,b=this._catBounds();
      c.x=clamp(c.x,b.left,b.right);
      if(this._motion.matches)return;
      const speed=clamp(this._size*1.6,120,260);
      if(c.x>=b.right-.2)c.direction=-1;
      else if(c.x<=b.left+.2)c.direction=1;
      c.velocity+=(c.direction*speed-c.velocity)*(1-Math.exp(-dt/140));
      c.x=clamp(c.x+c.velocity*dt/1000,b.left,b.right);
      if(this.movable){
        const lim=this._limits(),gap=Math.min(10,this._size*.05);
        const target=clamp(c.direction>0?c.x-this._size-gap:c.x+b.size+gap,lim.minX,lim.maxX);
        const delta=target-this._x,maxSpeed=clamp(this._size*1.45,105,235);
        const wanted=Math.sign(delta)*Math.min(maxSpeed,Math.abs(delta)*3);
        c.robotVelocity+=(wanted-c.robotVelocity)*(1-Math.exp(-dt/170));
        this._x=clamp(this._x+c.robotVelocity*dt/1000,lim.minX,lim.maxX);
        this._y=lim.maxY;
        if(Math.abs(c.robotVelocity)>8)this._face(c.robotVelocity>=0?1:-1);
        this._place();
      }else this._face(c.direction);
    }
    _paintKitten() {
      if(!['chase','catrest'].includes(this.state))return;
      if(!this._chase)this._startChase();
      const b=this._catBounds(),c=this._chase;
      c.x=clamp(c.x,b.left,b.right);
      this.style.setProperty('--cat-size',b.size+'px');
      this.style.setProperty('--cat-x',(c.x-(this.movable?this._x:0))+'px');
      this.style.setProperty('--cat-y',(this._size*.91-b.size*.89)+'px');
      this.style.setProperty('--cat-facing',String(c.direction));
      const src=this.getAttribute('cat-sprite')||this._activeAssets().cat;
      if(this._catImage!==src){this._catImage=src;this._catSprite.style.backgroundImage='url('+JSON.stringify(src)+')';}
      const frame=this._motion.matches?6:this.state==='catrest'?6+Math.floor(this._elapsed/900)%2:Math.floor(this._elapsed/145)%6;
      this._catSprite.style.backgroundPosition=(frame%4*100/3)+'% '+(Math.floor(frame/4)*100)+'%';
      this._catSprite.dataset.frame=String(frame);
    }

    setSpeechLevel(value){this._speechLevel=typeof value==='number'?clamp(value,0,1):null;}
    _paint() {
      this._paintKitten();
      const pose = poses[this.state];
      const atlas = pose.atlas || 'base';
      const cur = this._activeAssets();
      const image = atlas === 'emotions' ? this.getAttribute('emotions-sprite') || cur.emotions :
                    atlas === 'antics' ? this.getAttribute('antics-sprite') || cur.antics :
                    atlas === 'speech' ? this.getAttribute('speaking-sprite') || cur.speech :
                    atlas === 'traffic' ? this.getAttribute('traffic-sprite') || cur.traffic :
                    atlas === 'expressions' ? this.getAttribute('expressions-sprite') || cur.expressions :
                    atlas === 'base' ? this.getAttribute('sprite') || cur.base :
                    this.getAttribute('actions') || cur.action;
      if (this._image !== image) {
        this._image = image; this._sprite.style.backgroundImage = 'url(' + JSON.stringify(image) + ')';
      }
      let frame = pose.frames[Math.floor(this._elapsed / (pose.step || 200)) % pose.frames.length];
      if(this.state==='speaking'&&typeof this._speechLevel==='number'){
        if(this._elapsed-(this._speechFrameAt??-440)>=360){
          this._speechFrame=(this._speechFiltered||0)<.045?0:frame;this._speechFrameAt=this._elapsed;
        }
        frame=this._speechFrame||0;
      }
      if (this._motion.matches) frame = pose.frames[0];
      if (this.state === 'idle' && !this._motion.matches) {
        if (!this._blinkAt) this._blinkAt = 2400;
        if (this._elapsed >= this._blinkAt && this._elapsed < this._blinkAt+150) frame = 1;
        else if (this._elapsed >= this._blinkAt+150) this._blinkAt = this._elapsed+2800+Math.random()*2200;
      }
      const key = atlas + ':' + frame;
      if (this._frameKey === key) return;
      this._frameKey = key;
      this._sprite.style.backgroundPosition = (frame%4*100/3) + '% ' + (Math.floor(frame/4)*100) + '%';
      this._sprite.dataset.frame = String(frame); this._sprite.dataset.atlas = atlas;
    }
    _tick(time) {
      if (!this.isConnected || this.paused || document.hidden || !this._visible) { this._lastTime=0; this._raf=0; return; }
      const dt = this._lastTime ? Math.min(time-this._lastTime,50) : 0;
      this._lastTime = time; this._elapsed += dt;
      if(this.state==='speaking'&&typeof this._speechLevel==='number'){const mix=1-Math.exp(-dt/160);this._speechFiltered=(this._speechFiltered||0)+(this._speechLevel-(this._speechFiltered||0))*mix;}
      if(this.state==='chase')this._advanceChase(dt);
      else if(['drive','crosswalk'].includes(this.state))this._advanceRoadScene();
      else if (this._falling) {
        this._velocityY += 1900*dt/1000;
        this._y = Math.min(this._limits().maxY,this._y+this._velocityY*dt/1000);
        this._place();
        if (this._y >= this._limits().maxY) this._finishFall(true);
      } else if (this.state === 'walk' && this._walkTarget !== null) {
        const delta = this._walkTarget-this._x;
        const step = Math.min(Math.abs(delta),Math.max(50,this._size*.7)*dt/1000);
        this._face(delta >= 0 ? 1 : -1);
        this._x += Math.sign(delta)*step; this._place();
        if (Math.abs(this._walkTarget-this._x)<.5) {
          this._walkTarget = null; this._setPose('idle'); this._emit('robotwalkend',this.position);
        }
      }
      if (this._duration && this._elapsed >= this._duration && !this._pointer?.dragged) {
        const resume = this._returnState;
        if(this.state==='chase')this._setPose('catrest',{resume});
        else if(this.state==='fly')this._setPose('catch',{resume});
        else if(this.state==='catch')this._setPose('chew',{resume});
        else if (this.state === 'jump') this._setPose('land',{resume});
        else this._setPose(resume,{loop:true});
      }
      if (this.state === 'idle' && this.hasAttribute('roam') && !this._motion.matches && !this._pointer) {
        this._idleTime += dt;
        if (this._idleTime > 6000) {
          const choice = Math.random();
          if (choice < .2 && this.movable) this.play('walk');
          else if(choice<.34)this.play('scratch');
          else if(choice<.47)this.play('dance');
          else if(choice<.59)this.play('fly');
          else if(choice<.7)this.play('laugh');
          else if(choice<.81)this.play('plead');
          else if(choice<.91)this.play('chase');
          else this.play(choice<.96?'typing':'rest',{duration:4200});
        }
      }
      this._paint();
      if (this.isConnected && !this.paused && !document.hidden && this._visible) this._raf = requestAnimationFrame(next => this._tick(next));
      else this._raf = 0;
    }
  }
  if (!customElements.get('cute-robot')) customElements.define('cute-robot', CuteRobot);
  if (!customElements.get('khaled-guide-robot')) {
    class KhaledGuideRobot extends CuteRobot {}
    customElements.define('khaled-guide-robot', KhaledGuideRobot);
  }
})();
