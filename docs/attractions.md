# Attractions: how each one is played

A reference for keeping the park consistent. Taken from the code, not from intentions; keep it up to date when an
attraction changes. "Bubble" is the picture hint (`useHint`); "held" means the ride pins the animal with `hold()`.

## The shared rules

Five-year-olds carry a rule from one attraction to the next, so every exception is a place to get stuck.

1. **Getting on: walk into it.** Where that can't work, the ride helps: at the front of the ferris wheel's deck a
   little hop takes you into the gondola at the bottom (a jump of your own flies right over it). The exceptions use
   a button the child already knows from elsewhere: the tongue for things you hold (kite spool, carrot leaves,
   blocks, snowballs), and a jump onto a friend's back.
2. **Getting off: jump.** Every ride you might want to leave lets go on a jump, at any moment it is safe to.
   Exceptions are short rides that finish by themselves within a few seconds (a launcher, the cannon, the sled, the
   water slide); there, jump does something else or nothing, and the ride ends on its own.
3. **The stick steers whatever you are in** (sled, tractor, car, hamster ball, bubble); on a swing, holding it
   pumps.
4. **One rider on one ride at a time.** A held animal counts as launched (`isLaunched()`), so no other ride, back or
   tongue can take it. A ride that takes an animal off a friend's back or out of a tongue's grip is safe: piggyback and
   the tongue both let go of a held or launched animal by themselves. Rides that hold you, and the ferris wheel's
   hop, check `canBoard()` (`runtime.ts`).
5. **A rider who got off can't be caught again straight away** (a short pause, or landing well clear of the ride).
6. **Rescue and leaving free the ride.** Rides look their rider up each frame through `rider()`, which forgets one
   who has just been rescued or has left.
7. **Bubbles are for the children who need them.** Not over a child already on the ride (`wants`), and help meant
   for one child only in that child's view (`slot`).

## The table

Co-op: what a friend adds. Buddy: what the computer buddy does when one child plays alone.

### Rides that hold you

| Attraction | Get on | Play | Get off | Co-op | Buddy | Bubble |
|---|---|---|---|---|---|---|
| Sled | walk into it | stick steers, star hoops | flung off the hill at the bottom; a jump at the top flies further | second sled | takes the other sled down | walk |
| Zipline | step up to the handles | (it carries you) | jump, or the end over the lagoon | a handle per child | not allowed on | walk |
| Water slide | walk into the top of a lane | (it carries you) | the end, splash | two lanes side by side, sticker | hops into the other lane | walk, at the stairs |
| Tractor | walk to the seat | stick drives, noise = horn | jump | friends ride the trailer, sticker | can't drive | walk |
| Bumper cars | walk into a car | stick drives | jump | crash into each other | drives too, chases you | walk |
| Hamster balls | walk into a still ball | stick rolls it | jump | ball bumps, sticker | takes the next ball | walk |
| Hot air balloon | walk onto the pad | (a loop over the park) | jump (on the pad too), or step out on landing | up to four, sticker | hops in, jumps out after you | walk |
| Bubble | walk into a big bubble | stick drifts | jump pops it, or it pops after 7 s | a friend bumps it to pop | — | walk, at the machine |
| Swings | walk into a seat | hold the stick to swing higher | jump flies off (off a still swing, a hop clear of the seat) | headbutt push, sticker; paw prints show where | pushes you | walk; paws + headbutt for the pusher |
| Giant carrot | lick the leaves | stick away pulls | jump lets go | up to four, faster, sticker | comes to pull | lick |
| Cannon (ship) | walk into it | fired onto the lighthouse, 0.9 s | (lands) | — | follows you | walk |
| Launch pads, geysers | walk onto it | fly | (lands) | — | follows you | walk |
| Toilet | sit on the seat | poop flushes you away | walk off, or the flush | — | — | poop |

### Rides that carry you (physics, no holding)

| Attraction | Get on | Play | Get off | Co-op | Buddy | Bubble |
|---|---|---|---|---|---|---|
| River tubes | step onto the end one | floats down the river | jump, or tipped out at the end | share a ring | takes the next ring | walk |
| Roundabout | hop on | run beside it or headbutt to push | jump, or flung off when it whizzes | push a friend, sticker | pushes you | walk (not to riders) |
| Carousel | step on | round and round | walk or jump off | — | — | walk |
| Ferris wheel | walk to the front of the deck: a hop takes you into the gondola at the bottom | up and round, past the star | jump out | a gondola each | comes up in a gondola behind you | walk, on the deck |
| Train | stand on a wagon at the station | round the park | jump off | — | — | walk |
| See-saw | jump onto an end | fling a friend | jump off | needs a friend | sits on the far end | jump |
| Kites | lick a spool | run, the kite climbs; jump to glide | lick again to drop | two kites up, sticker | — | lick; paws "run"; jump once high |

### Games and toys

| Attraction | How | Goal | Co-op | Buddy | Bubble |
|---|---|---|---|---|---|
| Dominoes | bump or headbutt one | the chain rings the bell | — | — | headbutt |
| Whack-a-mole | bonk moles | ten, then the golden mole | together, sticker | bonks some, leaves the golden one | headbutt |
| Building blocks | lick to carry, lick to place | a tower of five, then knock it down | together, sticker | fetches blocks | lick |
| Xylophone | walk or jump on the keys | copy the bluebird's tune | anyone can play it back | only makes music | jump |
| Paint buckets | headbutt one | get painted, all four colours | splash friends | — | headbutt |
| Snowman | roll snowballs into the ring | bottom, middle, head (a ghost snowman shows it) | a snowball each | — | — |
| Snowball fight | lick a pile, lick to throw | hit a friend | sticker | throws back | lick |
| Penguin shy | throw snowballs | all five off | — | — | — (lick at the snow piles) |
| Fishing | lick the water | a fish; throw it at a friend or to the cat | fish slap, sticker | — | lick (one spot) |
| Chicken round-up | chase them | all eight in the coop | from both sides | walks loose ones to the gate | — |
| Ball pit | wade, jump in from high | the splash | — | — | jump |
| High striker | headbutt the pad | ring the bell | — | — | headbutt |
| Brontosaurus | headbutt the tummy five times | the sneeze | — | tickles it too | headbutt |
| Sky course | jump | the bell at the top | — | — | walk, jump |
| Soccer, bowling, crates | headbutt, push | goal, strike | — | — | — |
| Cats, birds, treasure | chase; listen | tag all four; find all five | — | turns cats back | — (sound, the dog's bark) |

## Open questions (decide from play, not from here)

- **No bubble at all:** the chicken round-up, the penguin shy, the snowman and soccer/bowling. They may well be clear
  enough from what you see (running chickens, a ghost snowman, a ball). Add help only where children are seen to get
  stuck, with the kite and swing pattern (`wants`, `slot`, `HelpPaws`, `Learned`).
- **Bubbles every time:** most bubbles still show every time any child comes near, also to a child who has used that
  attraction twenty times. With four children that is a lot of bubbles. Hiding a bubble once a child has used the
  thing (`Learned`) would be one line per attraction, but a bubble also says "there's something here". Leave as is
  until play shows it is noise.
- **Sled and water slide:** jump does not get you off. That's deliberate (short rides; on the sled a jump at the top
  flies further), and the play log should show if children try.
