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

## L7-2: wartime death risk for conscripts (from L2, v0.11.0)

- **What:** conscripts carry no extra mortality in war years (US Korea 1950–53 and Vietnam 1965–72, KR 1950s–60s, TW 1950s).
- **Why deferred:** adding it would move e0 for those cohorts; the e0 guardrail and the "risk is reallocated, not added" rule
  need a design decision (war deaths are a real shift of the life table for those cohorts).
- **To do in L7:** decide whether war mortality enters through the life table (WPP already contains it) or as a conscript-only
  hazard renormalised within the cohort; source per-war casualty rates under the licence rules (US federal PD).

## L7-3: conscription before 1945 / 1951 (from L2, v0.11.0)

- **What:** imperial Japanese conscription (to 1945), colonial-era conscription of Taiwanese and Koreans (1944–45), and TW
  before 1951 are not modelled; cohorts born before ≈ 1930 serve nothing in those countries.
- **To do in L7:** add law-fact rows with citations and write respectful, non-glorifying events (no stereotype-driven
  outcomes), together with L7-2.

## L7-4: Japanese non-regular employment is modelled sex-neutral (from L3, v0.11.0)

- **What:** in reality non-regular work in Japan is held mostly by women; v0.11 uses one era share for both sexes because no
  ILOSTAT (or other allowlisted) sex series for it is shipped, and the equity policy allows sex only where such data exists.
- **To do in L7:** look for an allowlisted sex-specific series (e-Stat Labour Force Survey under PDL 1.0 is the candidate);
  if ingested, apply it as a probability weight (never a gate) and rerun the JP equity check.

## Other follow-ups recorded in v0.11.0 (not L7)

- **Calibration pass after L4:** retirement age and pension type by era (TW/US/JP/KR tables exist in data/l2/institutions.json
  but the engine still uses the L0 retirement age + PaG replacement rate).
- **L4–L6:** replace the `law-facts` reference for non-L3 conscription rows (DE, GB, FR, BR, MX, CN and T2) with gazette
  citations per country.
