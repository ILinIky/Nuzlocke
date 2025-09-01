// login_fx.js – Cinematic Login Upgrades (no HTML changes required)
window.LoginFX = (() => {
    const RM = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  
    function $(s, r=document){ return r.querySelector(s); }
  
    function ensureTicker(){
      if (document.querySelector('.login-ticker')) return;
      const bar = document.createElement('div');
      bar.className = 'login-ticker';
      bar.innerHTML = `<div class="track">Pro-Tipp: Vergib Spitznamen für leichteres Filtern ·
        K.O. = Release – oder Box of Shame? ·
        Team-Slots per Drag&Drop! ·
        Moves-Tab: Auto-Tierlist (S→C, “Support” statt D) ·
        Lobby-Link kopieren & Freunde einladen!</div>`;
      document.body.appendChild(bar);
    }
  
    // Parallax via CSS vars on .login-card::before
    function attachParallax(card){
      if (!card) return;
      const onMove = (e) => {
        if (RM) return;
        const r = card.getBoundingClientRect();
        const cx = r.left + r.width/2, cy = r.top + r.height/2;
        const dx = (e.clientX - cx) / r.width;  // -0.5..0.5
        const dy = (e.clientY - cy) / r.height;
        // small translate range
        card.style.setProperty('--px', `${dx * 12}px`);
        card.style.setProperty('--py', `${dy * 8}px`);
      };
      window.addEventListener('mousemove', onMove, { passive:true });
    }
  
    // Stardust canvas
    function mountStars(){
      if (RM) return;
      if ($('#login-stars')) return;
      const c = document.createElement('canvas'); c.id = 'login-stars';
      document.body.appendChild(c);
      const ctx = c.getContext('2d');
      let W=0,H=0, stars=[];
      const resize=()=>{
        W = c.width = innerWidth * devicePixelRatio;
        H = c.height = innerHeight * devicePixelRatio;
        stars = Array.from({length: 90}, () => ({
          x: Math.random()*W, y: Math.random()*H,
          r: (Math.random()*1.4+0.6) * devicePixelRatio,
          s: Math.random()*0.4 + 0.15,
          a: Math.random()*Math.PI*2
        }));
      };
      resize(); addEventListener('resize', resize);
      (function tick(){
        ctx.clearRect(0,0,W,H);
        for(const p of stars){
          p.y -= p.s; p.x += Math.cos(p.a)*0.1;
          if (p.y < -10) { p.y = H+10; p.x = Math.random()*W; }
          ctx.beginPath();
          const g = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*4);
          g.addColorStop(0, 'rgba(255,255,255,.9)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
          ctx.fill();
        }
        requestAnimationFrame(tick);
      })();
    }
  
    // Subtle confetti (reuse your palette)
    function confettiBurst(root){
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:110;overflow:visible';
      document.body.appendChild(host);
      const colors = ['#ffd23f','#31d0aa','#ff6b6b','#7f8cff','#ff9f1a'];
      const N = RM ? 24 : 48;
      for (let i=0;i<N;i++){
        const e = document.createElement('i');
        e.style.cssText = 'position:absolute;width:8px;height:14px;border-radius:2px;box-shadow:0 2px 6px rgba(0,0,0,.28)';
        e.style.background = colors[i % colors.length];
        e.style.left = (innerWidth/2 + (Math.random()-0.5)*innerWidth*0.6) + 'px';
        e.style.top  = (innerHeight*0.35 + Math.random()*40) + 'px';
        host.appendChild(e);
        const tx = (Math.random()-0.5) * innerWidth * 0.4;
        const ty = innerHeight * (0.5 + Math.random()*0.3);
        const rot = (Math.random() * 720) * (Math.random()<.5?-1:1);
        const dur = (RM?700:1200) + Math.random()*600;
        e.animate([{transform:'translate(0,0) rotate(0)',opacity:1},{transform:`translate(${tx}px,${ty}px) rotate(${rot}deg)`,opacity:.9}],{duration:dur,easing:'cubic-bezier(.2,.7,.2,1)',fill:'forwards'}).onfinish = ()=> e.remove();
      }
      setTimeout(()=> host.remove(), 1800);
    }
  
    // Countdown bubble near the button
    function showCountdown(btn, secs=3){
      const parent = btn.closest('.login-card') || document.body;
      let b = parent.querySelector('.count-bubble');
      if (!b){ b = document.createElement('div'); b.className = 'count-bubble'; parent.appendChild(b); }
      b.classList.add('show');
      const tick = (n)=>{
        b.textContent = `Start in ${n}…`;
        if (n<=0){ b.classList.remove('show'); setTimeout(()=> b.remove(), 300); return; }
        setTimeout(()=> tick(n-1), 430);
      };
      tick(secs);
    }
  
    // Wire start button without breaking existing handler
    function wireStart(btn, overlay, card){
      if (!btn) return;
      btn.addEventListener('click', ()=>{
        // Visuals only – deine Logik bleibt in deiner bestehenden onclick
        btn.classList.add('loading');
        card?.classList.add('starting');
        showCountdown(btn, 3);
        setTimeout(()=> confettiBurst(), 550);
        setTimeout(()=> { btn.classList.remove('loading'); card?.classList.remove('starting'); }, 1400);
      }, { capture:true });
    }
  
    function enterAnimation(card){
      requestAnimationFrame(()=> card?.classList.add('is-in'));
    }
  
    function init(){
      const overlay = $('#loginOverlay');
      const card    = overlay?.querySelector('.login-card');
      const btn     = $('#startBtn');
  
      if (!overlay || !card) return;
  
      mountStars();
      attachParallax(card);
      enterAnimation(card);
      wireStart(btn, overlay, card);
    }
  
    return { init };
  })();
  