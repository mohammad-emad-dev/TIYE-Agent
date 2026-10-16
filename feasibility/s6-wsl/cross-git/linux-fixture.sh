set -eu
root=$1
token=$2
test "$(id -u)" != 0
test "$(readlink -f "$root")" = "$root"
test ! -e "$root/.tiye-owner"
printf %s "$token" > "$root/.tiye-owner"
repo="$root/repo space مرحبا 日本"
worktree="$root/worktree space مرحبا 日本"
gitx() {
 /usr/bin/git -c core.hooksPath=/dev/null -c init.templateDir= -c core.autocrlf=false -c core.eol=lf -c commit.gpgsign=false -c user.name=TIYE-Fixture -c user.email=fixture@example.invalid "$@"
}
gitx --version
gitx init --initial-branch=main "$repo"
gitx -C "$repo" config --list --show-origin
printf 'base\n' > "$repo/payload.txt"
gitx -C "$repo" add payload.txt
gitx -C "$repo" commit -m base
base=$(gitx -C "$repo" rev-parse HEAD)
gitx -C "$repo" worktree add -b fixture-edit "$worktree"
printf 'TIYE cross Git مرحبا 日本\nsecond line\n' > "$worktree/payload.txt"
gitx -C "$worktree" add payload.txt
gitx -C "$worktree" commit -m edit
edited=$(gitx -C "$worktree" rev-parse HEAD)
gitx -C "$repo" merge --ff-only fixture-edit
gitx -C "$repo" merge-base --is-ancestor "$base" "$edited"
test "$(gitx -C "$repo" rev-parse HEAD)" = "$edited"
test -z "$(gitx -C "$repo" status --porcelain)"
test -z "$(gitx -C "$worktree" status --porcelain)"
gitx -C "$repo" cat-file blob HEAD:payload.txt > "$root/blob.bin"
cmp "$root/blob.bin" "$repo/payload.txt"
cmp "$root/blob.bin" "$worktree/payload.txt"
printf 'repo=%s\nworktree=%s\nhead=%s\nblobSha256=%s\n' "$repo" "$worktree" "$edited" "$(sha256sum "$root/blob.bin" | cut -d ' ' -f 1)"
printf 'gitfile='; cat "$worktree/.git"
printf 'commondir='; cat "$repo/.git/worktrees/$(basename "$worktree")/commondir"
printf 'fixtureComplete=true\n'
