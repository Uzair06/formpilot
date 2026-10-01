# NVIDIA Workday recon

Target: https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/details/Senior-HPC-Storage-Engineer_JR2014997
(posting open as of 2026-10-01)

Snapshots are made with the side panel's **Save page snapshot** button (scripts, styles and typed values removed).

## Flow (what we know so far)

| Step | Title | Notes |
|---|---|---|
| — | Job details | `data-automation-id="adventureButton"` = **Apply**. Opens a choice: Autofill with Resume / **Apply Manually** / Use My Last Application. |
| 1 of 6 | Create Account/Sign In | URL ends `/apply/applyManually`. Buttons: `SignInWithEmailButton`, `GoogleSignInButton`, `LinkedInSignInButton`, `utilityButtonSignIn`. **FormPilot must pause here; the user signs in.** Snapshot: `nvidia-1-create-account-sign-in.html` |
| 2–6 of 6 | (to capture after sign-in) | Expected: My Information, My Experience, Application Questions, Voluntary Disclosures, Self Identify, Review |

The progress bar text reads like `current step 1 of 6Create Account/Sign In` (parsed in `src/scanner/snapshot.ts`).

Site search box (`keywordSearchInput`) sits outside the form; the Scanner ignores header/nav/search areas.
