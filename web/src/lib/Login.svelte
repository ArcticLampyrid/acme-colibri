<script lang="ts">
  import { api, errorMessage, type AuthMode } from "./api";

  let { mode, onlogin }: { mode: AuthMode; onlogin: () => void } = $props();

  const loginError = new URLSearchParams(location.search).get("login_error");
  let password = $state("");
  let error = $state(loginError === "denied" ? "This account is not allowed to administer this service." : loginError ? "Sign-in failed." : "");
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = "";
    try {
      await api("POST", "/api/auth/login", { password });
      password = "";
      onlogin();
    } catch (err) {
      error = errorMessage(err);
    } finally {
      busy = false;
    }
  }
</script>

<main class="center card stack">
  <h2>acme-colibri</h2>
  {#if mode === "oidc"}
    <a href="/api/auth/oidc/login"><button class="primary" style="width: 100%">Sign in with OIDC</button></a>
  {:else}
    <form class="stack" onsubmit={submit}>
      <label>Passcode <input type="password" bind:value={password} autocomplete="current-password" required /></label>
      <button class="primary" disabled={busy || !password}>Sign in</button>
    </form>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</main>
