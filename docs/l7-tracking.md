# L7 tracking (equity and content review)

Open items for the L7 equity review. Each item comes from a batch's equity check.

## L7-1: lower simulated lifetime income for women in Ethiopia (from L1, v0.10.0)

- **What:** born 1990, 800 lives. With occupations on, women's lifetime income is 0.928× the pre-occupation engine; men's
  is 1.069×. The women/men ratio falls from 1.159 to 1.005 (docs/l1-equity.json).
- **Cause so far:** about two thirds of the drop (1.159 → 1.058) appears even with NO sex weight, so it comes from how the
  occupation system works in a low-income, agriculture-heavy country, not from the ILOSTAT data. The ILOSTAT sex weights
  (observed occupational mix) add about −5 points.
- **Status:** inside the ±8% band; not a release blocker. Largest sex asymmetry of the 14 countries checked.
- **To do in L7:** rerun at ≥ 8 seed sets to separate noise (per-set spread is about ±10%), then trace which path causes
  it (job-group draw × education gate, care/homemaker years, informal work), and fix it if it is not grounded in data.
  Check other low-income countries (T3) for the same pattern.
