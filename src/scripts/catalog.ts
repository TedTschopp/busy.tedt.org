const catalog = document.querySelector<HTMLElement>('[data-catalog]');
if (catalog) {
  const get = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
  const ids = ['search','tag','contributor','source','status','sort'];
  const cards = [...catalog.querySelectorAll<HTMLElement>('[data-app-card]')];
  const gallery = catalog.querySelector<HTMLElement>('[data-gallery]')!;
  const defaults: Record<string,string> = { search:'',tag:'',contributor:'',source:'',status:'active',sort:'newest' };
  function restore() {
    const params = new URLSearchParams(location.search);
    for (const id of ids) get(id).value = params.get(id === 'search' ? 'q' : id) ?? defaults[id];
  }
  function update(writeUrl = true) {
    const q = get('search').value.trim().toLowerCase();
    let count = 0;
    for (const card of cards) {
      const d = card.dataset;
      const matches = (!q || d.search!.includes(q)) && (!get('tag').value || JSON.parse(d.tags!).includes(get('tag').value)) && (!get('contributor').value || d.author === get('contributor').value) && (!get('source').value || d.source === get('source').value) && (!get('status').value || d.status === get('status').value);
      card.hidden = !matches; if (matches) count++;
    }
    cards.sort((a,b) => {
      const sort = get('sort').value;
      const d = sort === 'newest' ? 'created' : sort;
      const diff = d === 'name' ? a.dataset.name!.localeCompare(b.dataset.name!) : ['downloads','rating'].includes(d) ? Number(b.dataset[d]) - Number(a.dataset[d]) : (b.dataset[d] ?? '').localeCompare(a.dataset[d] ?? '');
      return diff || a.dataset.name!.localeCompare(b.dataset.name!);
    }).forEach(c => gallery.append(c));
    catalog!.querySelector('[data-result-count]')!.textContent = String(count);
    catalog!.querySelector<HTMLElement>('[data-empty]')!.hidden = count > 0;
    catalog!.querySelector('[data-results-live]')!.textContent = `${count} apps found`;
    if (writeUrl) {
      const url = new URL(location.href);
      for (const id of ids) { const key = id === 'search' ? 'q' : id; const value = get(id).value; if (value === defaults[id]) url.searchParams.delete(key); else url.searchParams.set(key,value); }
      history.replaceState({},'',url);
    }
  }
  ids.forEach(id => get(id).addEventListener(id === 'search' ? 'input' : 'change', () => update()));
  catalog.querySelector('[data-reset]')!.addEventListener('click', () => { ids.forEach(id => get(id).value=defaults[id]); update(); });
  catalog.querySelector('[data-clear]')!.addEventListener('click', () => { get('search').value=''; update(); get('search').focus(); });
  addEventListener('popstate',()=>{restore();update(false);}); document.addEventListener('downloadcounts',()=>update(false));
  restore(); update(false);
}
