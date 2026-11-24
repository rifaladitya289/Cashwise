(() => {
  "use strict";
  const DB_NAME = "cashwise_database";
  const DB_VERSION = 1;
  const STORE_NAMES = ["transactions", "goals", "settings"];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const money = value => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value) || 0);
  const today = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  const uid = prefix => prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  let db;
  let state = { page: "home", transactions: [], goals: [], settings: { name: "", theme: "system", reduceMotion: false }, filter: "all", hideBalance: false };
  let activeForm = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("Browser ini tidak mendukung IndexedDB."));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("transactions")) {
          const store = database.createObjectStore("transactions", { keyPath: "id" });
          store.createIndex("date", "date", { unique: false });
        }
        if (!database.objectStoreNames.contains("goals")) database.createObjectStore("goals", { keyPath: "id" });
        if (!database.objectStoreNames.contains("settings")) database.createObjectStore("settings", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Database tidak dapat dibuka."));
      request.onblocked = () => reject(new Error("Database sedang digunakan tab lain. Tutup tab Cashwise lain lalu coba lagi."));
    });
  }
  function tx(store, mode = "readonly") { return db.transaction(store, mode).objectStore(store); }
  function getAll(store) {
    return new Promise((resolve, reject) => {
      const req = tx(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  function put(store, value) {
    return new Promise((resolve, reject) => {
      const req = tx(store, "readwrite").put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function remove(store, key) {
    return new Promise((resolve, reject) => {
      const req = tx(store, "readwrite").delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
  async function loadState() {
    const [transactions, goals, settings] = await Promise.all([getAll("transactions"), getAll("goals"), getAll("settings")]);
    state.transactions = transactions.sort((a,b) => (b.createdAt || b.date || "").localeCompare(a.createdAt || a.date || ""));
    state.goals = goals.sort((a,b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    state.settings = { name: "", theme: "system", reduceMotion: false };
    settings.forEach(item => { state.settings[item.key] = item.value; });
    applyTheme();
    render();
  }
  function sumTransactions(type, monthOnly = false) {
    const month = today().slice(0,7);
    return state.transactions.filter(item => item.type === type && (!monthOnly || item.date.slice(0,7) === month)).reduce((sum,item) => sum + Number(item.amount || 0), 0);
  }
  function totalBalance() {
    return sumTransactions("income") - sumTransactions("expense");
  }
  function allocatedBalance() {
    return state.goals.filter(goal => goal.status !== "deleted").reduce((sum,goal) => sum + Number(goal.saved || 0), 0);
  }
  function availableBalance() { return totalBalance() - allocatedBalance(); }
  function activeGoals() { return state.goals.filter(goal => goal.status === "active"); }
  function percent(saved,target) { return target > 0 ? Math.min(100, Math.max(0, Math.round(saved / target * 100))) : 0; }
  function dateLabel(date) {
    try { return new Intl.DateTimeFormat("id-ID", { day:"numeric", month:"short", year:"numeric" }).format(new Date(date + "T12:00:00")); }
    catch { return date || ""; }
  }
  function applyTheme() {
    const theme = state.settings.theme || "system";
    const light = theme === "light" || (theme === "system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches);
    document.body.classList.toggle("light", light);
    document.body.classList.toggle("reduce-motion", !!state.settings.reduceMotion);
    const themeColor = light ? "#f4f6f2" : "#111720";
    const meta = $('meta[name="theme-color"]'); if (meta) meta.content = themeColor;
  }
  function go(page) {
    if (!["home","wallet","savings","history","settings"].includes(page)) page = "home";
    state.page = page;
    $$(".page").forEach(el => el.classList.toggle("active", el.dataset.page === page));
    $$(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.go === page));
    if (location.hash !== "#" + page) history.replaceState(null, "", "#" + page);
    $("#app").focus({preventScroll:true});
    window.scrollTo({top:0,behavior:state.settings.reduceMotion ? "auto" : "smooth"});
    render();
  }
  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  }
  function transactionMarkup(item) {
    const incoming = item.type === "income";
    const internal = ["allocation","withdrawal"].includes(item.type);
    const symbol = incoming ? "↓" : item.type === "withdrawal" ? "↗" : item.type === "allocation" ? "◎" : "↑";
    const amountPrefix = incoming ? "+" : item.type === "expense" ? "−" : "";
    const amountClass = incoming ? "positive" : item.type === "expense" ? "negative" : "";
    const subtitle = [item.category || (internal ? "Tabungan" : "Transaksi"), dateLabel(item.date)].filter(Boolean).join(" · ");
    return '<div class="transaction-row"><span class="tx-icon">'+symbol+'</span><div class="tx-main"><b>'+escapeHTML(item.note || item.category || "Transaksi")+'</b><small>'+escapeHTML(subtitle)+'</small></div><span class="tx-amount '+amountClass+'">'+amountPrefix+money(item.amount)+'</span></div>';
  }
  function goalMarkup(goal, compact = false) {
    const p = percent(Number(goal.saved), Number(goal.target));
    const type = goal.type === "purchase" ? "PEMBELIAN" : "TABUNGAN";
    return compact
      ? '<div class="goal-mini"><div><b>'+escapeHTML(goal.name)+'</b><br><small>'+money(goal.saved)+' / '+money(goal.target)+'</small></div><small>'+p+'%</small><div class="progress-track"><span style="width:'+p+'%"></span></div></div>'
      : '<article class="goal-card"><div class="goal-card-top"><span class="goal-type">'+type+'</span><button class="goal-menu" data-goal-menu="'+escapeHTML(goal.id)+'" aria-label="Aksi target">•••</button></div><h3>'+escapeHTML(goal.name)+'</h3><div class="goal-numbers"><b>'+money(goal.saved)+'</b> / '+money(goal.target)+'</div><div class="progress-track"><span style="width:'+p+'%"></span></div><div class="goal-card-foot"><small>'+p+'% tercapai'+(goal.deadline ? " · "+dateLabel(goal.deadline) : "")+'</small><button class="text-btn" data-goal-add="'+escapeHTML(goal.id)+'">＋ Setor</button></div></article>';
  }
  function render() {
    const total = totalBalance(), allocated = allocatedBalance(), available = availableBalance();
    const incomeMonth = sumTransactions("income",true), expenseMonth = sumTransactions("expense",true);
    const goals = activeGoals();
    const savedPercent = total > 0 ? Math.min(100,Math.round(allocated/total*100)) : 0;
    const set = (id,value) => { const el = $("#"+id); if(el) el.textContent = value; };
    set("totalBalance", state.hideBalance ? "••••••••" : money(total));
    set("availableBalance", money(available)+" tersedia");
    set("savedBalance", money(allocated)+" ditabung");
    set("monthIncome",money(incomeMonth)); set("monthExpense",money(expenseMonth));
    set("savingsTotal",money(allocated)); set("goalCount",goals.length+" target aktif");
    set("savingsPercent",savedPercent+"% dari total saldo"); set("savingsAvailable",money(available));
    const progress = $("#savingsProgress"); if(progress) progress.style.width = savedPercent+"%";
    set("walletTotal",money(total)); set("walletAvailable",money(available)); set("walletAllocated",money(allocated));
    set("walletIncome",money(incomeMonth)); set("walletExpense",money(expenseMonth));
    set("savingsPageTotal",money(allocated)); set("savingsPageCount",goals.length+" target aktif");
    const name = state.settings.name || "Teman";
    set("greeting","HALO, "+name.toLocaleUpperCase("id-ID"));
    set("todayLabel",new Intl.DateTimeFormat("id-ID",{weekday:"short",day:"numeric",month:"short"}).format(new Date()));
    const featured = $("#featuredGoals");
    if(featured) featured.innerHTML = goals.length ? goals.slice(0,3).map(g=>goalMarkup(g,true)).join("") : '<div class="empty-inline">Belum ada target. Tambahkan tabungan atau barang yang ingin kamu beli.</div>';
    const recent = state.transactions.slice(0,3);
    $("#recentTransactions").innerHTML = recent.length ? recent.map(transactionMarkup).join("") : '<div class="empty-inline">Belum ada aktivitas. Catat pemasukan pertamamu.</div>';
    $("#walletTransactions").innerHTML = state.transactions.slice(0,5).map(transactionMarkup).join("") || '<div class="empty-inline">Belum ada transaksi.</div>';
    const allGoals = $("#allGoals");
    if(allGoals) {
      let shown = state.goals;
      if(state.filter === "completed") shown = shown.filter(g=>g.status==="completed");
      else if(state.filter !== "all") shown = shown.filter(g=>g.type===state.filter && g.status==="active");
      if(!shown.length) allGoals.innerHTML = '<div class="panel empty-state" style="grid-column:1/-1"><b>Belum ada target di sini</b><span>Buat target tabungan atau rencana pembelian pertamamu.</span></div>';
      else allGoals.innerHTML = shown.map(goalMarkup).join("");
    }
    const filtered = state.transactions.filter(item => {
      const type = $("#historyFilter")?.value || "all";
      const query = ($("#historySearch")?.value || "").toLowerCase();
      return (type==="all" || item.type===type) && (String(item.note||"").toLowerCase().includes(query) || String(item.category||"").toLowerCase().includes(query));
    });
    $("#historyList").innerHTML = filtered.length ? filtered.map(transactionMarkup).join("") : '<div class="empty-state"><b>Belum ada catatan</b><span>Transaksi yang kamu simpan akan muncul di sini.</span></div>';
    $("#profileName").value = state.settings.name || "";
    $("#themeSelect").value = state.settings.theme || "system";
    $("#reduceMotion").checked = !!state.settings.reduceMotion;
  }
  function toast(message) {
    const el=$("#toast"); el.textContent=message; el.classList.add("show");
    clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove("show"),2400);
  }
  function field(name,label,type="text",placeholder="",required=true,extra="") {
    return '<div class="form-group"><label for="f_'+name+'">'+label+'</label><input class="field" id="f_'+name+'" name="'+name+'" type="'+type+'" placeholder="'+placeholder+'" '+(required?"required":"")+' '+extra+'></div>';
  }
  function selectField(name,label,options) {
    return '<div class="form-group"><label for="f_'+name+'">'+label+'</label><select class="field" id="f_'+name+'" name="'+name+'">'+options.map(o=>'<option value="'+o[0]+'">'+o[1]+'</option>').join("")+'</select></div>';
  }
  function openForm(kind, goalId=null) {
    activeForm={kind,goalId};
    const fields=$("#formFields"), title=$("#formTitle"), eyebrow=$("#formEyebrow");
    $("#formError").textContent="";
    if(kind==="income" || kind==="expense") {
      title.textContent=kind==="income"?"Tambah pemasukan":"Tambah pengeluaran"; eyebrow.textContent="WALLET RECORD";
      fields.innerHTML=field("amount","Nominal (Rp)","number","Contoh: 50000",true,'min="1" step="1" inputmode="numeric"')+field("note","Keterangan","text",kind==="income"?"Contoh: Uang saku":"Contoh: Makan siang")+selectField("category","Kategori",kind==="income"?[["Pemasukan","Pemasukan"],["Gaji","Gaji"],["Uang saku","Uang saku"],["Hadiah","Hadiah"],["Lainnya","Lainnya"]]:[["Kebutuhan","Kebutuhan"],["Makanan","Makanan"],["Transportasi","Transportasi"],["Belanja","Belanja"],["Hiburan","Hiburan"],["Lainnya","Lainnya"]])+field("date","Tanggal","date",today(),true,'value="'+today()+'"');
    } else if(kind==="goal") {
      title.textContent="Buat target baru"; eyebrow.textContent="SAVINGS GOAL";
      fields.innerHTML=field("name","Nama target","text","Contoh: Laptop")+selectField("type","Jenis target",[["savings","Tabungan"],["purchase","Pembelian barang"]])+field("target","Nominal target (Rp)","number","Contoh: 5000000",true,'min="1" step="1" inputmode="numeric"')+field("deadline","Target tanggal (opsional)","date","",false)+selectField("priority","Prioritas",[["normal","Normal"],["high","Tinggi"],["low","Rendah"]]);
    } else if(kind==="allocate") {
      title.textContent="Alokasikan dana"; eyebrow.textContent="MOVE TO SAVINGS";
      const opts=activeGoals().map(g=>[g.id,g.name+" · "+money(g.target-g.saved)+" lagi"]);
      if(!opts.length){toast("Buat target tabungan terlebih dahulu.");return;}
      fields.innerHTML=selectField("goalId","Pilih target",opts)+field("amount","Nominal alokasi (Rp)","number","Contoh: 100000",true,'min="1" step="1" inputmode="numeric"');
    } else if(kind==="deposit") {
      title.textContent="Tambah tabungan"; eyebrow.textContent="GOAL DEPOSIT";
      const goal=state.goals.find(g=>g.id===goalId); if(!goal)return;
      fields.innerHTML='<p class="muted">Target: <b>'+escapeHTML(goal.name)+'</b> · Sisa '+money(Math.max(0,goal.target-goal.saved))+'</p>'+field("amount","Nominal setoran (Rp)","number","Contoh: 50000",true,'min="1" step="1" inputmode="numeric"');
    } else if(kind==="withdraw") {
      title.textContent="Tarik tabungan"; eyebrow.textContent="GOAL WITHDRAWAL";
      const goal=state.goals.find(g=>g.id===goalId); if(!goal)return;
      fields.innerHTML='<p class="muted">Dari target: <b>'+escapeHTML(goal.name)+'</b></p>'+field("amount","Nominal penarikan (Rp)","number","Contoh: 50000",true,'min="1" step="1" inputmode="numeric"');
    }
    $("#formDialog").showModal();
  }
  async function submitForm(event) {
    event.preventDefault(); if(!activeForm)return;
    const data=new FormData(event.currentTarget), value=name=>String(data.get(name)||"").trim();
    const amount=Number(value("amount"));
    try {
      if(["income","expense"].includes(activeForm.kind)) {
        if(!Number.isSafeInteger(amount)||amount<=0) throw new Error("Nominal harus berupa angka Rupiah lebih dari 0.");
        if(activeForm.kind==="expense" && amount>availableBalance()) throw new Error("Saldo tersedia tidak mencukupi. Periksa saldo dan alokasi tabunganmu.");
        const record={id:uid("trx"),type:activeForm.kind,amount,note:value("note"),category:value("category"),date:value("date")||today(),createdAt:new Date().toISOString()};
        await put("transactions",record);
      } else if(activeForm.kind==="goal") {
        const target=Number(value("target"));
        if(!value("name")) throw new Error("Nama target wajib diisi.");
        if(!Number.isSafeInteger(target)||target<=0) throw new Error("Target harus berupa angka Rupiah lebih dari 0.");
        const record={id:uid("goal"),name:value("name"),type:value("type"),target,saved:0,deadline:value("deadline")||null,priority:value("priority"),status:"active",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        await put("goals",record);
      } else if(activeForm.kind==="allocate") {
        const goal=state.goals.find(g=>g.id===value("goalId"));
        if(!goal) throw new Error("Pilih target yang valid.");
        if(!Number.isSafeInteger(amount)||amount<=0) throw new Error("Nominal alokasi tidak valid.");
        if(amount>availableBalance()) throw new Error("Saldo tersedia tidak mencukupi.");
        goal.saved=Number(goal.saved)+amount; goal.status=goal.saved>=goal.target?"completed":"active"; goal.updatedAt=new Date().toISOString();
        await put("goals",goal);
        await put("transactions",{id:uid("trx"),type:"allocation",amount,note:"Alokasi ke "+goal.name,category:"Tabungan",goalId:goal.id,date:today(),createdAt:new Date().toISOString()});
      } else if(activeForm.kind==="deposit") {
        const goal=state.goals.find(g=>g.id===activeForm.goalId);
        if(!goal||!Number.isSafeInteger(amount)||amount<=0) throw new Error("Nominal setoran tidak valid.");
        if(amount>availableBalance()) throw new Error("Saldo tersedia tidak mencukupi.");
        goal.saved=Number(goal.saved)+amount; goal.status=goal.saved>=goal.target?"completed":"active"; goal.updatedAt=new Date().toISOString();
        await put("goals",goal);
        await put("transactions",{id:uid("trx"),type:"allocation",amount,note:"Setoran · "+goal.name,category:"Tabungan",goalId:goal.id,date:today(),createdAt:new Date().toISOString()});
      } else if(activeForm.kind==="withdraw") {
        const goal=state.goals.find(g=>g.id===activeForm.goalId);
        if(!goal||!Number.isSafeInteger(amount)||amount<=0||amount>goal.saved) throw new Error("Nominal penarikan melebihi saldo target atau tidak valid.");
        goal.saved-=amount; goal.status="active"; goal.updatedAt=new Date().toISOString();
        await put("goals",goal);
        await put("transactions",{id:uid("trx"),type:"withdrawal",amount,note:"Penarikan · "+goal.name,category:"Tabungan",goalId:goal.id,date:today(),createdAt:new Date().toISOString()});
      }
      $("#formDialog").close(); activeForm=null; await loadState(); toast("Berhasil disimpan.");
    } catch(error) { $("#formError").textContent=error.message||"Terjadi kesalahan."; }
  }
  async function goalMenu(id) {
    const goal=state.goals.find(g=>g.id===id); if(!goal)return;
    const choice=prompt("Kelola "+goal.name+"\nKetik: setor, tarik, selesai, beli, hapus");
    if(!choice)return;
    if(choice.toLowerCase()==="setor") return openForm("deposit",id);
    if(choice.toLowerCase()==="tarik") return openForm("withdraw",id);
    if(choice.toLowerCase()==="selesai") {
      goal.status="completed"; goal.updatedAt=new Date().toISOString(); await put("goals",goal); await loadState(); toast("Target ditandai selesai.");
    } else if(choice.toLowerCase()==="beli") {
      if(goal.type!=="purchase"){toast("Aksi beli hanya tersedia untuk target pembelian.");return;}
      if(goal.saved<=0){toast("Belum ada dana pada target ini.");return;}
      if(!confirm("Catat pembelian "+goal.name+" sebesar "+money(goal.saved)+"? Dana target akan digunakan dan saldo total berkurang."))return;
      const spent=Number(goal.saved);
      goal.saved=0; goal.status="completed"; goal.updatedAt=new Date().toISOString();
      await put("goals",goal);
      await put("transactions",{id:uid("trx"),type:"expense",amount:spent,note:"Pembelian · "+goal.name,category:"Pembelian",goalId:goal.id,date:today(),createdAt:new Date().toISOString()});
      await loadState(); toast("Pembelian berhasil dicatat.");
    } else if(choice.toLowerCase()==="hapus") {
      if(!confirm("Hapus target ini? Dana yang sudah dialokasikan akan dikembalikan ke Available Balance."))return;
      if(goal.saved>0) await put("transactions",{id:uid("trx"),type:"withdrawal",amount:goal.saved,note:"Pengembalian dana · "+goal.name,category:"Tabungan",goalId:goal.id,date:today(),createdAt:new Date().toISOString()});
      await remove("goals",id); await loadState(); toast("Target dihapus dan dananya dikembalikan.");
    }
  }
  async function saveSetting(key,value) { state.settings[key]=value; await put("settings",{key,value}); applyTheme(); render(); }
  async function exportBackup() {
    const payload={app:"Cashwise",schemaVersion:1,exportedAt:new Date().toISOString(),transactions:state.transactions,goals:state.goals,settings:state.settings};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob), link=document.createElement("a"); link.href=url; link.download="cashwise-backup-"+today()+".json"; link.click(); URL.revokeObjectURL(url); toast("Backup berhasil dibuat.");
  }
  async function importBackup(file) {
    if(!file)return;
    try {
      if(file.size>5*1024*1024) throw new Error("Ukuran backup maksimal 5 MB.");
      const data=JSON.parse(await file.text());
      if(data.app!=="Cashwise"||data.schemaVersion!==1||!Array.isArray(data.transactions)||!Array.isArray(data.goals)||!data.settings||typeof data.settings!=="object") throw new Error("Format backup tidak dikenali atau tidak valid.");
      for(const t of data.transactions) if(!t.id||!["income","expense","allocation","withdrawal"].includes(t.type)||!Number.isSafeInteger(t.amount)||t.amount<=0) throw new Error("Data transaksi di backup tidak valid.");
      for(const g of data.goals) if(!g.id||!g.name||!Number.isSafeInteger(g.target)||g.target<=0||!Number.isSafeInteger(g.saved)||g.saved<0) throw new Error("Data target di backup tidak valid.");
      if(!confirm("Import akan mengganti seluruh data Cashwise saat ini. Lanjutkan?"))return;
      await new Promise((resolve,reject)=>{const transaction=db.transaction(STORE_NAMES,"readwrite");const ts=transaction.objectStore("transactions"),gs=transaction.objectStore("goals"),ss=transaction.objectStore("settings");ts.clear();gs.clear();ss.clear();data.transactions.forEach(x=>ts.put(x));data.goals.forEach(x=>gs.put(x));Object.entries(data.settings).forEach(([key,value])=>ss.put({key,value}));transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);});
      await loadState(); toast("Backup berhasil dipulihkan.");
    } catch(error) { toast(error.message||"Gagal membaca backup."); }
    finally { $("#importFile").value=""; }
  }
  async function resetData() {
    if(!confirm("Hapus seluruh transaksi, target, dan pengaturan? Buat backup terlebih dahulu jika diperlukan."))return;
    await new Promise((resolve,reject)=>{const transaction=db.transaction(STORE_NAMES,"readwrite");STORE_NAMES.forEach(name=>transaction.objectStore(name).clear());transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);});
    await loadState(); toast("Data Cashwise telah direset.");
  }
  function bindEvents() {
    document.addEventListener("click",event=>{
      const nav=event.target.closest("[data-go]"); if(nav){go(nav.dataset.go);return;}
      const action=event.target.closest("[data-action]"); if(action){openForm(action.dataset.action);return;}
      const addGoal=event.target.closest("[data-goal-add]"); if(addGoal){openForm("deposit",addGoal.dataset.goalAdd);return;}
      const menu=event.target.closest("[data-goal-menu]"); if(menu){goalMenu(menu.dataset.goalMenu);return;}
    });
    $("#entryForm").addEventListener("submit",submitForm);
    $("#closeDialog").addEventListener("click",()=>$("#formDialog").close());
    $("#cancelDialog").addEventListener("click",()=>$("#formDialog").close());
    $("#addGoalBtn").addEventListener("click",()=>openForm("goal"));
    $("#goalFilters").addEventListener("click",event=>{const button=event.target.closest("[data-filter]");if(!button)return;state.filter=button.dataset.filter;$$(".filter").forEach(el=>el.classList.toggle("active",el===button));render();});
    $("#historySearch").addEventListener("input",render); $("#historyFilter").addEventListener("change",render);
    $("#themeToggle").addEventListener("click",()=>saveSetting("theme",document.body.classList.contains("light")?"dark":"light"));
    $("#themeSelect").addEventListener("change",event=>saveSetting("theme",event.target.value));
    $("#profileName").addEventListener("change",event=>saveSetting("name",event.target.value.trim()));
    $("#reduceMotion").addEventListener("change",event=>saveSetting("reduceMotion",event.target.checked));
    $("#hideBalance").addEventListener("click",()=>{state.hideBalance=!state.hideBalance;render();$("#hideBalance").textContent=state.hideBalance?"Tampilkan":"Sembunyikan";});
    $("#exportBtn").addEventListener("click",exportBackup);
    $("#importBtn").addEventListener("click",()=>$("#importFile").click());
    $("#importFile").addEventListener("change",event=>importBackup(event.target.files[0]));
    $("#resetBtn").addEventListener("click",resetData);
    window.addEventListener("hashchange",()=>go(location.hash.slice(1)));
    if(window.matchMedia) window.matchMedia("(prefers-color-scheme: light)").addEventListener?.("change",()=>{if(state.settings.theme==="system")applyTheme();});
  }
  async function init() {
    bindEvents();
    try { db=await openDB(); await loadState(); }
    catch(error) { document.body.innerHTML='<main style="max-width:600px;margin:15vh auto;padding:24px;font:16px system-ui"><h1>Cashwise tidak dapat membuka penyimpanan</h1><p>'+escapeHTML(error.message)+'</p><p>Coba buka ulang aplikasi atau gunakan browser yang mendukung penyimpanan lokal.</p></main>'; return; }
    const initial=location.hash.slice(1); if(initial)go(initial);
    if("serviceWorker" in navigator && (location.protocol==="https:" || location.hostname==="localhost")) navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
  }
  init();
})();