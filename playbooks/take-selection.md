# Playbook: choosing takes

Goal: one take per scene that shows what the brief needs, with no glitch inside the range the edit
will use. You look only at contact sheets, never at full frames or whole videos.

1. `briefcut sheets <film> --takes` writes `out/sheets/<take>.jpg` (2 fps, 180 px, time and frame
   number on every tile) and `out/sheets/<take>.motion.tsv` (mean frame difference per frame).
2. For each scene, open every take's sheet and check, in order:
   - **The action happens**, roughly when the prompt asked, and early enough for the shot length
     the brief aims for. A hook scene must act in its first half second.
   - **No glitch** in the range you would use: extra or missing limbs, objects that morph or vanish,
     text, logos, overlays (one Midnight take grew a film-sprocket overlay at 3.5 s), sudden
     lighting jumps, a character that changes.
   - **Nothing unsafe** is modelled on screen (for children's films especially).
   - **Continuity** with the neighbouring scenes: palette, time of day, the same props.
3. Use the motion profile to see what a 2 fps sheet hides. A sheet samples every 12th frame at
   24 fps; a regular action at about 2 per second can look frozen or identical on every tile
   (the Midnight hammer did). Regular spikes in the motion column mean a periodic action.
4. Prefer the take with the readable action over the prettier one. A take that deviates from the
   prompt can still be the right one if the deviation reads well; write it down.
5. Copy the chosen take to `clips/<SCENE>.mp4`, move the others to `clips/_rejected/`.
6. Write `clips/NOTES.md`: a table (scene, used take, rejected takes, why) and a "Known deviations"
   paragraph, then the credits spent. The brief handles deviations: if an event the brief names does
   not exist in the chosen take, event detection will mark it `not found`.
