(function (global){
    function $(sel, ctx=document){ return (typeof sel === 'string') ? ctx.querySelector(sel) : sel; }
    function create(html){ const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
    function esc(s){ return String(s).replace(/[&<>\"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'}[c])); }
  
    class PsInstance{
      constructor(select, opts={}){
        this.select = $(select);
        if(!this.select) throw new Error('PokeSelect: select not found');
        this.opts = Object.assign({ placeholder:'Wähle…', searchable:true }, opts);
        this.id = 'ps-' + Math.random().toString(36).slice(2,8);
        this.isOpen = false; this.activeIndex = -1;
        this._build();
        this._syncFromSelect();
        this._attach();
      }
  
      _build(){

        this.select.classList.add('ps-hidden');
        this.wrap = create(`<div class="ps-wrap"></div>`);
        this.select.parentNode.insertBefore(this.wrap, this.select);
        this.wrap.appendChild(this.select);
  
        const labelText = this._selectedLabel() || this.opts.placeholder;
        const isPlaceholder = !this._hasValue();
        this.trigger = create(`
          <button type="button" class="ps-trigger" id="${this.id}-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="${this.id}-list">
            <span class="ps-ball" aria-hidden="true"><span class="ps-btn"></span></span>
            <span class="ps-label ${isPlaceholder ? 'ps-placeholder':''}">${esc(labelText)}</span>
            <svg class="ps-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>`);
  
        const searchHTML = this.opts.searchable ? `
          <div class="ps-search" role="search">
           
            <input type="text" placeholder="Suchen… (↑/↓, Enter)" autocomplete="off" aria-label="Optionen durchsuchen" />
          </div>` : '';
  
        this.panel = create(`
          <div class="ps-panel" role="dialog" aria-modal="false">
            ${searchHTML}
            <div class="ps-list" id="${this.id}-list" role="listbox"></div>
          </div>`);
  
        this.wrap.appendChild(this.trigger);
        this.wrap.appendChild(this.panel);
        this.list = this.panel.querySelector('.ps-list');
        this.input = this.panel.querySelector('input');
        this._renderOptions();
        // am Ende von _build():
queueMicrotask(() => { this.panel.style.minWidth = this.trigger.offsetWidth + 'px'; });

      }
  
      _options(){
        const opts = [];
        Array.from(this.select.children).forEach(ch => {
          if(ch.tagName === 'OPTGROUP'){
            Array.from(ch.children).forEach(o => opts.push({ value:o.value, label:o.label || o.textContent, disabled:o.disabled, group: ch.label }));
          }else if(ch.tagName === 'OPTION'){
            opts.push({ value: ch.value, label: ch.label || ch.textContent, disabled: ch.disabled });
          }
        });
        return opts;
      }
  
      _selectedValue(){ return this.select.value; }
      _selectedLabel(){ const o = this.select.selectedOptions?.[0]; return o ? (o.label||o.textContent) : null; }
      _hasValue(){ return this.select.selectedIndex >= 0 && this.select.value !== ''; }
  
      _renderOptions(filter=''){
        const q = filter.trim().toLowerCase();
        const opts = this._options().filter(o => !q || (o.label.toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q)));
        this.filtered = opts;
        this.list.innerHTML = opts.map((o,i)=>{
          const selected = String(o.value) === String(this._selectedValue());
          return `<div class="ps-opt${selected?' ps-active':''}" role="option" data-value="${esc(o.value)}" aria-selected="${selected}" ${o.disabled?'aria-disabled="true"':''}>
            <span class="ps-chip">${esc(o.label)}</span>
          </div>`;
        }).join('') || `<div class="ps-opt" aria-disabled="true" style="opacity:.6">Keine Treffer…</div>`;
        this.optEls = Array.from(this.list.querySelectorAll('.ps-opt'));
        this.activeIndex = this.filtered.length ? Math.max(0, this.filtered.findIndex(o=> String(o.value) === String(this._selectedValue()))) : -1;
        this._highlightActive();
      }
  
      _attach(){
        const open = ()=>{ this.panel.classList.add('ps-open'); this.trigger.setAttribute('aria-expanded','true'); if(this.input){ this.input.value=''; this.input.focus(); this._renderOptions(''); } };
        const close = ()=>{ this.panel.classList.remove('ps-open'); this.trigger.setAttribute('aria-expanded','false'); this.activeIndex = -1; };
        const toggle = ()=> this.panel.classList.contains('ps-open') ? close() : open();
  
        this.trigger.addEventListener('click', toggle);
        this.trigger.addEventListener('keydown', (e)=>{ if(['ArrowDown','Enter',' '].includes(e.key)){ e.preventDefault(); open(); }});
        document.addEventListener('click', (e)=>{ if(!this.wrap.contains(e.target)) close(); });
  
        if(this.input){
          this.input.addEventListener('input', ()=> this._renderOptions(this.input.value));
          this.input.addEventListener('keydown', (e)=>{
            if(e.key==='Escape'){ e.preventDefault(); close(); this.trigger.focus(); }
            else if(e.key==='Enter'){ e.preventDefault(); if(this.activeIndex>=0) this._pick(this.filtered[this.activeIndex].value); }
            else if(e.key==='ArrowDown'){ e.preventDefault(); this._move(1); }
            else if(e.key==='ArrowUp'){ e.preventDefault(); this._move(-1); }
          });
        }
  
        this.list.addEventListener('click', (e)=>{
          const el = e.target.closest('.ps-opt'); if(!el || el.getAttribute('aria-disabled')==='true') return;
          this._pick(el.getAttribute('data-value'));
        });
  
        this.select.addEventListener('change', ()=> this._syncFromSelect());
      }
  
      _move(step){ if(!this.filtered?.length) return; let i = this.activeIndex; i = (i<0?0:i)+step; if(i<0) i=this.filtered.length-1; if(i>=this.filtered.length) i=0; this.activeIndex=i; this._highlightActive(); }
      _highlightActive(){ this.optEls?.forEach((el,idx)=>{ el.classList.toggle('ps-active', idx===this.activeIndex); if(idx===this.activeIndex) el.scrollIntoView({block:'nearest'}); }); }
  
      _pick(value){
        if(this.select.value !== value){
          this.select.value = value;
          this.select.dispatchEvent(new Event('change', { bubbles:true }));
        }
        const label = this._selectedLabel() || this.opts.placeholder;
        this.trigger.querySelector('.ps-label').textContent = label;
        this.trigger.querySelector('.ps-label').classList.toggle('ps-placeholder', !this._hasValue());
        this._renderOptions(this.input ? this.input.value : '');
        this.panel.classList.remove('ps-open');
        this.trigger.setAttribute('aria-expanded','false');
        this.trigger.focus();
      }
  
      _syncFromSelect(){
        const label = this._selectedLabel() || this.opts.placeholder;
        if(!this.trigger){ return; }
        const labelEl = this.trigger.querySelector('.ps-label');
        labelEl.textContent = label; labelEl.classList.toggle('ps-placeholder', !this._hasValue());
        this._renderOptions(this.input ? this.input.value : '');
      }
  
      destroy(){
        this.wrap.parentNode.insertBefore(this.select, this.wrap);
        this.select.classList.remove('ps-hidden');
        this.wrap.remove();
      }
    }
  
    const PokeSelect = {
      enhance(target, opts){
        const el = $(target);
        if(!el) throw new Error('PokeSelect.enhance: target not found');
        return new PsInstance(el, opts);
      }
    };
  
    global.PokeSelect = PokeSelect;
  })(window);
  