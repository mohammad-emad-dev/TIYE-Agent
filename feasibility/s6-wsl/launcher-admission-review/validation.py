def validate_review(document):
    from pathlib import PurePosixPath

    def require(condition, code):
        if not condition:
            raise ValueError(code)

    def path_ok(value):
        if not isinstance(value, str) or not value or "\\" in value or ":" in value or chr(0) in value:
            return False
        parts = value.split("/")
        return (
            all(part not in ("", ".", "..") for part in parts)
            and not PurePosixPath(value).is_absolute()
        )

    top_keys = {
        "schema", "projectDate", "scope", "decision", "nativeAdmissionGranted",
        "nativeU0Runs", "phase1", "requirements", "cohorts", "executionBoundary",
    }
    require(isinstance(document, dict) and set(document) == top_keys, "top-level-keys")
    require(document["schema"] == "tiye-launcher-readiness-v1", "schema")
    require(document["projectDate"] == "2026-10-17", "project-date")
    require(document["scope"] == "launcher-readiness-review-only", "scope")
    require(document["decision"] == "HOLD", "decision")
    require(document["nativeAdmissionGranted"] is False, "native-admission")
    require(type(document["nativeU0Runs"]) is int and document["nativeU0Runs"] == 0, "native-u0-runs")
    require(document["phase1"] == "HOLD", "phase1")
    require(document["executionBoundary"] == "no-launch-no-auth-no-inference", "execution-boundary")

    expected = {"L1": [], "L2": ["L1"], "P1": ["L1"], "P2": ["L1"],
                "A1": ["L1", "L2", "P1", "P2"]}
    req_keys = {"id", "status", "dependsOn", "evidence", "acceptance"}
    reqs = document["requirements"]
    require(isinstance(reqs, list) and len(reqs) == 5, "requirements-count")
    by_id = {}
    for item in reqs:
        require(isinstance(item, dict) and set(item) == req_keys, "requirement-keys")
        rid = item["id"]
        require(isinstance(rid, str) and rid in expected and rid not in by_id, "requirement-id")
        by_id[rid] = item
    require(set(by_id) == set(expected), "requirement-ids")

    for rid, item in by_id.items():
        status = item["status"]
        require(status == "blocked" if rid == "A1" else status in ("open", "partial"),
                "requirement-status")
        deps = item["dependsOn"]
        require(isinstance(deps, list) and all(isinstance(d, str) for d in deps), "dependencies")
        require(len(deps) == len(set(deps)) and rid not in deps, "dependency-duplicates")
        require(all(d in by_id for d in deps), "dependency-missing")
        require(deps == expected[rid], "dependency-set")
        evidence = item["evidence"]
        require(isinstance(evidence, list) and evidence, "requirement-evidence")
        require(all(path_ok(p) for p in evidence), "requirement-path")
        acceptance = item["acceptance"]
        require(isinstance(acceptance, str) and acceptance.strip(), "acceptance")

    visiting, visited = set(), set()

    def visit(rid):
        require(rid not in visiting, "dependency-cycle")
        if rid not in visited:
            visiting.add(rid)
            for dep in by_id[rid]["dependsOn"]:
                visit(dep)
            visiting.remove(rid)
            visited.add(rid)

    for rid in by_id:
        visit(rid)

    cohort_ids = {
        "s4-codex-u0-launcher", "s4-codex-u0-watchdog-v2",
        "s4-codex-u0-supervised", "s6-linux-owner", "s6-linux-stop",
        "s6-linux-service", "s6-service-transport", "s6-service-inflight",
        "s6-cross-owner",
    }
    cohorts = document["cohorts"]
    cohort_keys = {"id", "evidence", "checker", "tests", "cases"}
    require(isinstance(cohorts, list) and len(cohorts) == 9, "cohorts-count")
    seen = set()
    for cohort in cohorts:
        require(isinstance(cohort, dict) and set(cohort) == cohort_keys, "cohort-keys")
        cid = cohort["id"]
        require(isinstance(cid, str) and cid in cohort_ids and cid not in seen, "cohort-id")
        seen.add(cid)
        require(path_ok(cohort["evidence"]) and path_ok(cohort["checker"]), "cohort-path")
        require(type(cohort["tests"]) is int and cohort["tests"] > 0, "cohort-tests")
        require(type(cohort["cases"]) is int and cohort["cases"] > 0, "cohort-cases")
    require(seen == cohort_ids, "cohort-ids")
