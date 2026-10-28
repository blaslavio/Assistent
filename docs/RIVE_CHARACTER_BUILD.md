# Approved assistant illustration — Rive build specification

Source: `assets/assistant_source.svg` (vector trace of the user-approved minimal green line character).

**Status:** the source vector is committed; the animated `.riv` file has **not** been produced. Do not rename the SVG to `.riv`. Do not substitute a different mascot.

## Rive build steps

1. Open [Rive Editor](https://rive.app/), create a 1536 × 1024 canvas, and import `assets/assistant_source.svg`.
2. Preserve the minimal dark-green outline and two eyes. Separate the outline and eyes into controllable groups without redrawing the overall silhouette.
3. Create a state machine named **Assistant** with a **Number** input named **status**.
4. Define states: 0 idle (gentle sway), 1 listening (subtle tilt), 2 thinking (slow attention movement), 3 speaking (brief expressive pulse), 4 success (small positive movement), 5 error (subtle hesitation). Avoid flashing, aggressive motion and distracting effects.
5. Add transitions based on `status`; each state must remain visible while its input value is active. Set 0 as the default.
6. Export a binary Rive runtime file as `assets/assistant.riv`. Verify it in `streamlit run rive_preview.py`, and then in the main assistant chat.
7. Respect reduced-motion preferences and check rendering on mobile and desktop.

The production renderer **already expects** precisely `assets/assistant.riv`, a state machine called `Assistant`, and the numeric input `status`. An SVG source alone is not a functional Rive animation.

## Integration verification

- `python -m unittest tests.test_rive_assistant tests.test_rive_chat_state` where the package test discovery setup supports it, otherwise `python -m unittest discover -s tests -p 'test_rive*.py'`.
- `streamlit run rive_preview.py` and manually test all six states.
- Without `assets/assistant.riv`, the production chat continues without a mascot.
