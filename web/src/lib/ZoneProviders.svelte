<script lang="ts">
  import { onMount } from "svelte";
  import { api, errorMessage, type ProviderType, type ZoneProvider } from "./api";

  let types = $state<ProviderType[]>([]);
  let providers = $state<ZoneProvider[]>([]);
  let error = $state("");

  /** `editing` is the id being edited, or null when creating. */
  let editing = $state<string | null>(null);
  let formOpen = $state(false);
  let id = $state("");
  let type = $state("");
  let values = $state<Record<string, string>>({});

  const typeDef = $derived(types.find((t) => t.type === type));

  async function load() {
    try {
      [types, providers] = await Promise.all([
        api<ProviderType[]>("GET", "/api/admin/provider-types"),
        api<ZoneProvider[]>("GET", "/api/admin/zone-providers"),
      ]);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  function openForm(p?: ZoneProvider) {
    editing = p?.id ?? null;
    id = p?.id ?? "";
    type = p?.type ?? types[0]?.type ?? "";
    values = { ...(p?.config ?? {}) }; // secrets are never sent back, so they start empty
    formOpen = true;
    error = "";
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!typeDef) return;
    const pick = (secret: boolean) =>
      Object.fromEntries(typeDef.fields.filter((f) => f.secret === secret && values[f.name]).map((f) => [f.name, values[f.name]]));
    try {
      if (editing) await api("PATCH", `/api/admin/zone-providers/${editing}`, { config: pick(false), secrets: pick(true) });
      else await api("POST", "/api/admin/zone-providers", { id, type, config: pick(false), secrets: pick(true) });
      formOpen = false;
      await load();
    } catch (err) {
      error = errorMessage(err);
    }
  }

  async function remove(p: ZoneProvider) {
    if (!confirm(`Delete zone provider "${p.id}"?`)) return;
    try {
      await api("DELETE", `/api/admin/zone-providers/${p.id}`);
      await load();
    } catch (err) {
      error = errorMessage(err);
    }
  }

  onMount(load);
</script>

<section class="card">
  <div class="row between">
    <h2>Zone providers</h2>
    <button class="primary" onclick={() => openForm()} disabled={types.length === 0}>Add</button>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if formOpen}
    <form class="stack card" onsubmit={save}>
      <label>ID <input bind:value={id} disabled={editing !== null} pattern="[a-z0-9][a-z0-9_\-]{'{0,63}'}" placeholder="cf-zone-main" required /></label>
      <label>Type
        <select bind:value={type} disabled={editing !== null}>
          {#each types as t}<option value={t.type}>{t.label}</option>{/each}
        </select>
      </label>
      {#if typeDef}
        {#each typeDef.fields as f}
          <label>
            {f.label}
            <input
              type={f.secret ? "password" : "text"}
              autocomplete="off"
              bind:value={values[f.name]}
              required={!editing || !f.secret}
              placeholder={editing && f.secret ? "unchanged — leave blank to keep" : ""}
            />
          </label>
        {/each}
      {/if}
      <div class="row">
        <button class="primary">Save</button>
        <button type="button" onclick={() => (formOpen = false)}>Cancel</button>
      </div>
    </form>
  {/if}

  {#each providers as p (p.id)}
    <div class="item row between">
      <div>
        <strong>{p.id}</strong> <span class="tag">{p.type}</span>
        <div class="muted">{Object.entries(p.config).map(([k, v]) => `${k}: ${v}`).join(" · ")} · credentials stored encrypted</div>
      </div>
      <div class="row">
        <button onclick={() => openForm(p)}>Edit</button>
        <button class="danger" onclick={() => remove(p)}>Delete</button>
      </div>
    </div>
  {:else}
    <p class="muted">No zone providers yet.</p>
  {/each}
</section>
