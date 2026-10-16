set -eu
root=$1
token=$2
test -d "$root"
test "$(cat "$root/.tiye-owner")" = "$token"
test "$(readlink -f "$root")" = "$root"
repo="$root/repo space مرحبا 日本"
worktree="$root/worktree space مرحبا 日本"
payload='payload مرحبا 日本.txt'
test ! -e "$repo"
test ! -e "$worktree"
mkdir "$repo"
gitx() {
  /usr/bin/git -c core.hooksPath=/dev/null -c init.templateDir= -c core.autocrlf=false -c core.eol=lf -c core.quotePath=false -c commit.gpgsign=false -c user.name=TIYE-Fixture -c user.email=fixture@example.invalid "$@"
}
gitx --version
gitx -C "$repo" init --initial-branch=main
gitx -C "$repo" config --list --show-origin
printf 'base\n' > "$repo/$payload"
gitx -C "$repo" add -- "$payload"
gitx -C "$repo" commit -m base
base=$(gitx -C "$repo" rev-parse HEAD)
gitx -C "$repo" worktree add -b fixture-edit "$worktree"
canonical=$(readlink -f "$worktree")
test "$canonical" = "$worktree"
case "$canonical" in "$root/"*) ;; *) exit 41 ;; esac
printf 'canonicalRepo=%s\ncanonicalWorktree=%s\n' "$(readlink -f "$repo")" "$canonical"
printf 'TIYE path/git مرحبا 日本\nsecond line\n' > "$worktree/$payload"
gitx -C "$worktree" add -- "$payload"
gitx -C "$worktree" commit -m edit
edited=$(gitx -C "$worktree" rev-parse HEAD)
test "$base" != "$edited"
gitx -C "$repo" merge --ff-only fixture-edit
test "$(gitx -C "$repo" rev-parse HEAD)" = "$edited"
test "$(gitx -C "$repo" rev-parse fixture-edit)" = "$edited"
test "$(gitx -C "$worktree" rev-parse HEAD)" = "$edited"
gitx -C "$repo" merge-base --is-ancestor "$base" "$edited"
test -z "$(gitx -C "$repo" status --porcelain)"
test -z "$(gitx -C "$worktree" status --porcelain)"
gitx -C "$repo" cat-file blob "HEAD:$payload" > "$root/blob.bin"
cmp "$root/blob.bin" "$repo/$payload"
cmp "$root/blob.bin" "$worktree/$payload"
printf 'blobSha256=%s\n' "$(sha256sum "$root/blob.bin" | cut -d ' ' -f 1)"
printf 'fileSha256=%s\n' "$(sha256sum "$repo/$payload" | cut -d ' ' -f 1)"
printf 'base=%s\nedited=%s\n' "$base" "$edited"
# Removal targets only the canonical, marker-owned, clean fixture worktree.
test "$(cat "$root/.tiye-owner")" = "$token"
test "$(readlink -f "$worktree")" = "$canonical"
gitx -C "$repo" worktree remove "$worktree"
test ! -e "$worktree"
gitx -C "$repo" worktree list --porcelain
test "$(gitx -C "$repo" rev-parse HEAD)" = "$edited"
test -z "$(gitx -C "$repo" status --porcelain)"
test "$(gitx -C "$repo" rev-list --count HEAD)" = 2
printf 'fixtureComplete=true\n'
