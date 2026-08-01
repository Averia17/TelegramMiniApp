# TODO: безопасная предикция урона

- [x] Pure ledger/geometry tests are red before implementation.
- [x] Add authoritative `attackDamage` and bullet `damage` fields.
- [x] Predict only safe basic hits and replicated bullet crossings.
- [x] Reconcile confirmed damage and smooth missed-hit rollback.
- [x] Keep abilities server-authoritative.
- [ ] Run battle Go tests (blocked by pre-existing missing `rollBasicAttackDamage` implementation in the dirty server tree).
