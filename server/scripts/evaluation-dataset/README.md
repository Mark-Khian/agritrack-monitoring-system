# Evaluation synthetic dataset (guarded seeder)

**Target DB:** `crop_management_eval` only  
**Dataset id:** `AGRITRACK_EVAL_DATASET_v1`  
**Marker:** `AgriTrack synthetic evaluation record`

## Safety

- Default = **dry run** (no writes).
- Writes require `--execute-evaluation-seed` or `--rollback-evaluation-seed`.
- Before any write (and for Evaluation dry-run), `SELECT DATABASE()` must be exactly `crop_management_eval`.
- Explicitly rejects `crop_management`, `crop_management_dev`, `crop_management_rearch_test`.
- **Atomicity:** all 15 crops seed inside **one** DB transaction. `ensureAllSystemTemplates` uses the same connection. Failure → full rollback (no partial synthetic set).
- **Collision:** normal execute refuses if any target field name already exists. `--replace-evaluation-seed` only removes rows proven to be this synthetic dataset.
- **Manifest:** after successful seed, writes exact IDs under `server/backups/evaluation-seed-manifests/`.

## Commands

From `server/`:

```bash
# Authoritative Evaluation dry-run (REQUIRED before write)
node scripts/evaluation-dataset/seed-evaluation-dataset.js --db-name=crop_management_eval

# Execute (after backup + successful Evaluation dry-run)
node scripts/evaluation-dataset/seed-evaluation-dataset.js --db-name=crop_management_eval --execute-evaluation-seed

# Replace proven synthetic seed then reseed
node scripts/evaluation-dataset/seed-evaluation-dataset.js --db-name=crop_management_eval --execute-evaluation-seed --replace-evaluation-seed

# Rollback using latest/explicit manifest (exact IDs + marker verification)
node scripts/evaluation-dataset/seed-evaluation-dataset.js --db-name=crop_management_eval --rollback-evaluation-seed
node scripts/evaluation-dataset/seed-evaluation-dataset.js --db-name=crop_management_eval --rollback-evaluation-seed --manifest=backups/evaluation-seed-manifests/<file>.json
```

Before execute: take a fresh Evaluation DB backup.

## Rollback order

Notifications → harvests → activities → plantings  

Only manifest-owned (or marker-proven) synthetic rows. Never users, varieties, audit logs, sessions, or unrelated Evaluation data.
