# Next: source-bound ambient-access qualification

The private nine-mode mock lifecycle matrix is now captured. Address P1 on the
actual managed runtime and document the intended product trust boundary before
considering a native provider attempt.

- Review the architecture's intended account/filesystem/network permissions and
  list which reach is intentional and which must be restricted. Shared-account
  authority is not removed by fresh HOME, an environment allowlist or a cgroup.
- Use newly created synthetic canaries/resources to measure fixed filesystem and
  local socket/network reach from a source-bound mock peer with the same runtime
  identity/profile. Do not read real credential files, enumerate home directories,
  query keyrings or contact external services.
- Bind the exact new probe/launcher/storage sources and input resources. Keep raw
  observations private and export reviewed derivative verdicts. Prove resource
  ownership and cleanup separately from denied/allowed access assertions.
- Distinguish current metadata, actual successful opens/connections, actual
  denials and untested paths. A reachable canary proves that reach, not credential
  compromise; a single denied canary does not prove general confinement.
- Record the resulting explicit access decision and unresolved limits. Keep P2's
  alternate-token/Linux storage/retention obligations and A1's separate native
  admission gate open until their own evidence/approval exists.

Historical sources/ledgers stay sealed. No authentication change, real provider
task, live-secret inspection or native launch is needed for this bounded probe.
