# Voice audition: Narrator

Line `Right on the hour.`, model `eleven_multilingual_v2`, settings stability 0.6, similarity_boost 0.8, style 0.1, use_speaker_boost true, speed 0.9. Each take measured over its voiced frames (within 25 dB of the loudest 43 ms frame): fundamental = median of a normalized autocorrelation pitch track (60-300 Hz); spectral centroid = centroid of the average magnitude spectrum, 60-8000 Hz; low share = power 80-300 Hz as a share of 80-8000 Hz. Pick: the lowest and fullest voice, by the sum of its ranks for fundamental and centroid (lower is better), ties to the larger low share.

| Candidate | Voice in the account | Fundamental (Hz) | Spectral centroid (Hz) | Low share | Rank sum | Take |
|---|---|---|---|---|---|---|
| Daniel | Daniel - Steady Broadcaster | 124.0 | 1465 | 81.6% | 4 | vo_8_narrator_v2.mp3 |
| Adam **(picked)** | Adam Stone - Smooth, Deep, and Relaxed | 90.1 | 1424 | 49.9% | 2 | vo_8_narrator_v3.mp3 |
| Bill | Bill - Wise, Mature, Balanced | 241.2 | 1752 | 40.6% | 8 | vo_8_narrator_v4.mp3 |
| Brian | Brian - Deep, Resonant and Comforting | 133.7 | 1676 | 43.6% | 6 | vo_8_narrator_v5.mp3 |
