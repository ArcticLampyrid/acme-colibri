<script lang="ts">
  import { onMount } from "svelte";
  import { api, errorMessage, type AccessPoint, type KeyReveal, type ZoneProvider } from "./api";

  type Mapping = { suffix: string; zone: string };

  let aps = $state<AccessPoint[]>([]);
  let zones = $state<ZoneProvider[]>([]);
  let error = $state("");

  let editing = $state<string | null>(null);
  let formOpen = $state(false);
  let id = $state("");
  let mappings = $state<Mapping[]>([]);

  let reveal = $state<KeyReveal | null>(null);
  let dialog = $state<HTMLDialogElement>();

  async function load() {
    try {
      [aps, zones] = await Promise.all([
        api<AccessPoint[]>("GET", "/api/admin/access-points"),
        api<ZoneProvider[]>("GET", "/api/admin/zone-providers"),
      ]);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  function openForm(ap?: AccessPoint) {
    editing = ap?.id ?? null;
    id = ap?.id ?? "";
    mappings = Object.entries(ap?.provides ?? {}).map(([suffix, zone]) => ({ suffix, zone }));
    if (mappings.length === 0) mappings = [{ suffix: "", zone: zones[0]?.id ?? "" }];
    formOpen = true;
    error = "";
  }

  const toProvides = () => Object.fromEntries(mappings.filter((m) => m.suffix.trim()).map((m) => [m.suffix.trim(), m.zone]));

  async function save(e: SubmitEvent) {
    e.preventDefault();
    try {
      if (editing) {
        await api("PUT", `/api/admin/access-points/${editing}`, { provides: toProvides() });
      } else {
        showKey(await api<KeyReveal>("POST", "/api/admin/access-points", { id, provides: toProvides() }));
      }
      formOpen = false;
      await load();
    } catch (err) {
      error = errorMessage(err);
    }
  }

  async function rotate(ap: AccessPoint) {
    if (!confirm(`Rotate the key of "${ap.id}"? The current key stops working immediately.`)) return;
    try {
      showKey(await api<KeyReveal>("POST", `/api/admin/access-points/${ap.id}/rotate-key`));
    } catch (err) {
      error = errorMessage(err);
    }
  }

  async function remove(ap: AccessPoint) {
    if (!confirm(`Delete access point "${ap.id}"?`)) return;
    try {
      await api("DELETE", `/api/admin/access-points/${ap.id}`);
      await load();
    } catch (err) {
      error = errorMessage(err);
    }
  }

  function showKey(r: KeyReveal) {
    reveal = r;
    dialog?.showModal();
  }

  function closeKey() {
    reveal = null; // the key only ever lives in this variable
    dialog?.close();
  }

  const exampleDomain = (r: KeyReveal) => Object.keys(r.accessPoint.provides)[0] ?? "example.com";

  const legoExample = (r: KeyReveal) =>
    `HTTPREQ_ENDPOINT=${location.origin} \\
HTTPREQ_USERNAME=${r.accessPoint.id} \\
HTTPREQ_PASSWORD=${r.key} \\
lego --dns httpreq -d ${exampleDomain(r)} -d '*.${exampleDomain(r)}' -m you@example.com run`;

  const caddyExample = (r: KeyReveal) =>
    `# Build Caddy with the ACMEProxy DNS provider first:
# xcaddy build --with github.com/caddy-dns/acmeproxy@v1.1.1

${exampleDomain(r)} {
  tls {
    dns acmeproxy ${location.origin} {
      username ${r.accessPoint.id}
      password ${r.key}
    }
  }
}`;

  const basicAuth = (r: KeyReveal) => btoa(`${r.accessPoint.id}:${r.key}`);

  const certbotExample = (r: KeyReveal) =>
    `# Install the HTTPREQ authenticator plugin: https://github.com/Cornelicorn/certbot-httpreq
python3 -m pip install git+https://github.com/Cornelicorn/certbot-httpreq.git

# Keep this file private; Certbot reuses it for renewals.
umask 077
cat > /etc/letsencrypt/httpreq.ini <<'EOF'
dns_httpreq_endpoint = ${location.origin}
dns_httpreq_username = ${r.accessPoint.id}
dns_httpreq_password = ${r.key}
EOF
chmod 600 /etc/letsencrypt/httpreq.ini

certbot certonly --authenticator dns-httpreq \\
  --dns-httpreq-credentials=/etc/letsencrypt/httpreq.ini \\
  -d ${exampleDomain(r)} -d '*.${exampleDomain(r)}'`;

  const certManagerExample = (r: KeyReveal) =>
    `# Install the cert-manager HTTPREQ webhook:
# helm repo add cert-manager-webhook-httpreq https://saturncloud.github.io/cert-manager-webhook-httpreq/ --force-update
# helm upgrade --install httpreq-webhook cert-manager-webhook-httpreq/httpreq-webhook \\
#   --set secrets.role.enabled=true \\
#   --set 'secrets.role.namespaces.default[0]=httpreq-headers'
#
# Replace "default" above if the Issuer and Secret use another namespace. The webhook
# reads HTTP headers from this Secret and sends JSON requests to
# /present and /cleanup. Keep the Secret in the Issuer namespace.
apiVersion: v1
kind: Secret
metadata:
  name: httpreq-headers
type: Opaque
stringData:
  Authorization: Basic ${basicAuth(r)}
---
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: letsencrypt-dns
spec:
  acme:
    email: you@example.com
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-dns-account-key
    solvers:
      - dns01:
          webhook:
            groupName: acme.saturncloud.io
            solverName: httpreq
            config:
              endpoint: ${location.origin}
              presentPath: /present
              cleanupPath: /cleanup
              headerSecretRef:
                name: httpreq-headers`;

  const acmeShExample = (r: KeyReveal) =>
    `export ACMEPROXY_ENDPOINT='${location.origin}'
export ACMEPROXY_USERNAME='${r.accessPoint.id}'
export ACMEPROXY_PASSWORD='${r.key}'

acme.sh --issue --dns dns_acmeproxy \\
  -d ${exampleDomain(r)} -d '*.${exampleDomain(r)}'`;

  const copy = (value: string) => navigator.clipboard.writeText(value);
  onMount(load);
</script>

<section class="card">
  <div class="row between">
    <h2>Access points</h2>
    <button class="primary" onclick={() => openForm()} disabled={zones.length === 0} title={zones.length === 0 ? "Create a zone provider first" : ""}>Add</button>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if formOpen}
    <form class="stack card" onsubmit={save}>
      <label>Access ID <input bind:value={id} disabled={editing !== null} pattern="[a-z0-9][a-z0-9_\-]{'{0,63}'}" placeholder="ap1" required /></label>
      <div class="stack">
        <span class="muted">Allowed domain suffixes → zone provider</span>
        {#each mappings as m, i}
          <div class="row">
            <input bind:value={m.suffix} placeholder="main.com" style="flex: 1" />
            <select bind:value={m.zone}>{#each zones as z}<option value={z.id}>{z.id}</option>{/each}</select>
            <button type="button" aria-label="Remove mapping" onclick={() => (mappings = mappings.filter((_, j) => j !== i))}>✕</button>
          </div>
        {/each}
        <div><button type="button" onclick={() => (mappings = [...mappings, { suffix: "", zone: zones[0]?.id ?? "" }])}>Add suffix</button></div>
      </div>
      {#if !editing}<p class="muted">The Access Key is generated on creation and shown only once.</p>{/if}
      <div class="row">
        <button class="primary">{editing ? "Save" : "Create"}</button>
        <button type="button" onclick={() => (formOpen = false)}>Cancel</button>
      </div>
    </form>
  {/if}

  {#each aps as ap (ap.id)}
    <div class="item row between">
      <div>
        <strong>{ap.id}</strong>
        {#each Object.entries(ap.provides) as [suffix, zone]}
          <div class="muted"><code>{suffix}</code> → {zone}</div>
        {:else}
          <div class="muted">No domains allowed.</div>
        {/each}
      </div>
      <div class="row">
        <button onclick={() => openForm(ap)}>Edit</button>
        <button onclick={() => rotate(ap)}>Rotate key</button>
        <button class="danger" onclick={() => remove(ap)}>Delete</button>
      </div>
    </div>
  {:else}
    <p class="muted">No access points yet.</p>
  {/each}
</section>

<dialog bind:this={dialog} onclose={() => (reveal = null)}>
  {#if reveal}
    <div class="stack">
      <h2>Configure access point “{reveal.accessPoint.id}”</h2>
      <p class="muted">Copy the Access Key now — it cannot be shown again. Choose your ACME client below. These examples use the first allowed domain suffix and the standard <code>/present</code> and <code>/cleanup</code> requests; replace the sample email as needed.</p>
      <div class="key-reveal">
        <pre>{reveal.key}</pre>
        <button class="primary" onclick={() => copy(reveal!.key)}>Copy Access Key</button>
      </div>
      <div class="examples">
        <details open>
          <summary>Lego</summary>
          <p class="muted">Uses Lego’s default HTTPREQ mode; no <code>HTTPREQ_MODE</code> is needed.</p>
          <pre>{legoExample(reveal)}</pre>
          <button onclick={() => copy(legoExample(reveal!))}>Copy example</button>
        </details>
        <details>
          <summary>Caddy</summary>
          <pre>{caddyExample(reveal)}</pre>
          <button onclick={() => copy(caddyExample(reveal!))}>Copy example</button>
        </details>
        <details>
          <summary>Certbot</summary>
          <p class="muted">Install the <code>certbot-httpreq</code> plugin and keep its credentials file private so renewals can reuse it.</p>
          <pre>{certbotExample(reveal)}</pre>
          <button onclick={() => copy(certbotExample(reveal!))}>Copy example</button>
        </details>
        <details>
          <summary>cert-manager.io</summary>
          <p class="muted">Install Saturn Cloud’s <code>cert-manager-webhook-httpreq</code>; it sends the standard HTTPREQ JSON requests with the configured Authorization header.</p>
          <pre>{certManagerExample(reveal)}</pre>
          <button onclick={() => copy(certManagerExample(reveal!))}>Copy example</button>
        </details>
        <details>
          <summary>acme.sh</summary>
          <pre>{acmeShExample(reveal)}</pre>
          <button onclick={() => copy(acmeShExample(reveal!))}>Copy example</button>
        </details>
      </div>
      <div class="row">
        <button onclick={closeKey}>Done</button>
      </div>
    </div>
  {/if}
</dialog>
