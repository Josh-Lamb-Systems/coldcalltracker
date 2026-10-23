<span class="logo">
  <svg viewBox="0 0 32 32" width="40" height="40" aria-hidden="true">
    <rect width="32" height="32" rx="6" fill="var(--accent)" />
    <g stroke="#fff" stroke-width="2.6" stroke-linecap="round">
      <path d="M9 8v16M13.5 8v16M18 8v16M22.5 8v16" />
      <path d="M6 21 26 11" />
    </g>
  </svg>
  <span class="wordmark">Cold Call Tracker</span>
</span>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }

  .wordmark {
    font-family: "Arial Narrow", "Roboto Condensed", "Helvetica Neue", var(--font);
    font-stretch: condensed;
    font-size: 1.375rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
    white-space: nowrap;
  }

  @media (max-width: 480px) {
    .wordmark {
      font-size: 1.125rem;
    }
  }
</style>
