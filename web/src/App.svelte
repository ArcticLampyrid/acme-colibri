<script lang="ts">
  import { onMount } from "svelte";
  import { api, type Session } from "./lib/api";
  import AccessPoints from "./lib/AccessPoints.svelte";
  import Login from "./lib/Login.svelte";
  import ZoneProviders from "./lib/ZoneProviders.svelte";

  let session = $state<Session | null>(null);
  let tab = $state<"access-points" | "zone-providers">("access-points");

  const refresh = async () => (session = await api<Session>("GET", "/api/auth/session"));
  const logout = async () => {
    await api("POST", "/api/auth/logout");
    await refresh();
  };

  onMount(refresh);
</script>

{#if !session}
  <main><p class="muted">Loading…</p></main>
{:else if session.mode === "disabled"}
  <main class="center card">
    <h2>Admin interface disabled</h2>
    <p class="muted">Configure <code>OIDC_ISSUER</code> (+ client id/secret) or <code>ADMIN_PASSWORD</code> and redeploy.</p>
  </main>
{:else if !session.user}
  <Login mode={session.mode} onlogin={refresh} />
{:else}
  <main>
    <header>
      <h1>acme-colibri</h1>
      <nav>
        <button class="tab" aria-current={tab === "access-points" ? "page" : undefined} onclick={() => (tab = "access-points")}>Access points</button>
        <button class="tab" aria-current={tab === "zone-providers" ? "page" : undefined} onclick={() => (tab = "zone-providers")}>Zone providers</button>
      </nav>
      <span class="muted">{session.user}</span>
      <button onclick={logout}>Log out</button>
    </header>
    {#if tab === "access-points"}<AccessPoints />{:else}<ZoneProviders />{/if}
  </main>
{/if}
