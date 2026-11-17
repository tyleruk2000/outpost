<!-- Written by scripts/write-which-model.mjs from packages/shared/src/model-trials.ts. Change that file, not this one. -->

# Which model

Which of the models tried here to use for answers and Chat, and whether each can look things up in Outpost. Measured on 2026-11-17, on an Apple M2 Max Mac with 32 GB of memory, with Ollama 0.40.16. The same page is inside Outpost at `/help/which-model`, linked where a model is chosen. How it was measured is in [ai.md](ai.md#tried-with-a-real-model-tools).

**No model has been timed on a Raspberry Pi.** A Pi will be slower; by how much has not been measured.

## Start here

- **On a Raspberry Pi: `lfm3:1.7b`.** It looked things up rightly 15 times in 16 and answered 28 of 32 library questions rightly, in 1.7 GB, which a Pi 5 with 4 GB can hold. Get it with `ollama pull lfm3:1.7b`.
- **On a Mac or PC: `lfm3:1.7b`.** The two larger models looked things up no better here, took about three times as long, and often thought past their allowance on library questions.
- **Not worth getting: `llama3.2:1b`.** It cannot look things up: it writes its requests out as text instead of making them.
- **Not worth getting: `bonsai-2:4b`.** No better than bonsai-2:2b at looking things up, slower, and it often thought past its allowance on library questions.

## Each model

### `llama3.2:1b`: not recommended

Quick, but it cannot look things up, and is unreliable on library answers.

- Download: 1.3 GB
- Memory while answering here: 1.7 GB
- Suits: a Raspberry Pi 5 with 4 GB
- Licence: [Llama 3.2 Community License](https://www.llama.com/llama3_2/license/)
- Thinks before answering: no
- Answers from the library's passages: 47 of 64 right; declined 22 of 26 it should have. Two runs. It often numbers its own sentences as if they were sources.
- Looking things up: 6 of 16 right. Half the time it wrote its request, or a tool's whole description, into its reply as text.
- Time: first word 0.9 s, whole reply 1.4 s (medians), on that Mac, not on a Pi

### `lfm3:1.7b`: looks things up well

The best all round of those tried. Its licence is free for a household; a business with $10 million a year or more in revenue needs another.

- Download: 1.7 GB
- Memory while answering here: 1.7 GB
- Suits: a Raspberry Pi 5 with 4 GB
- Licence: [LFM Open License v1.0](https://www.liquid.ai/lfm-license)
- Thinks before answering: yes
- Answers from the library's passages: 28 of 32 right; declined 13 of 13 it should have
- Looking things up: 15 of 16 right. It looked for the shipping forecast in the library instead of the radio frequencies.
- Time: first word 3.5 s, whole reply 4.2 s (medians), on that Mac, not on a Pi

### `bonsai-2:2b`: looks things up well

The smallest, and looks things up well; for answers from the library it often thinks too long to answer.

- Download: 911 MB
- Memory while answering here: 1.0 GB
- Suits: a Raspberry Pi 5 with 4 GB
- Licence: [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- Thinks before answering: yes
- Answers from the library's passages: 19 of 32 right; declined 12 of 13 it should have. 13 of the 45 ended with no answer at all: it spent its whole allowance thinking.
- Looking things up: 14 of 16 right. It said it had nothing on the shipping forecast without looking, and answered the boiling question from memory.
- Time: first word 2.3 s, whole reply 3.2 s (medians), on that Mac, not on a Pi

### `llama3.2:3b`: looks things up well

The most reliable on answers from the library; looks things up adequately, now and then taking a figure from the wrong line.

- Download: 2.0 GB
- Memory while answering here: 3.1 GB
- Suits: a Raspberry Pi 5 with 8 GB
- Licence: [Llama 3.2 Community License](https://www.llama.com/llama3_2/license/)
- Thinks before answering: no
- Answers from the library's passages: 58 of 64 right; declined 26 of 26 it should have. Two runs.
- Looking things up: 13 of 16 right. It gave the water's days as the food's, looked up the capital of France in the catalogue, and once wrote a request out as text.
- Time: first word 2.9 s, whole reply 2.9 s (medians), on that Mac, not on a Pi

### `bonsai-2:4b`: looks things up well

Looks things up well but no better than the 2b, more slowly; poor on library answers because it thinks too long.

- Download: 1.6 GB
- Memory while answering here: 1.9 GB
- Suits: a Raspberry Pi 5 with 4 GB
- Licence: [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- Thinks before answering: yes
- Answers from the library's passages: 13 of 32 right; declined 10 of 13 it should have. 21 of the 45 ended with no answer at all: it spent its whole allowance thinking.
- Looking things up: 15 of 16 right. It answered the boiling question from memory (rightly) instead of from the library.
- Time: first word 5.8 s, whole reply 7.5 s (medians), on that Mac, not on a Pi

### `bonsai-2:9b`: looks things up well

Fits in memory on a Pi with 8 GB, but took 11 seconds to its first word even on this Mac; poor on library answers.

- Download: 3.2 GB
- Memory while answering here: 2.8 GB
- Suits: a Mac or PC (too large for a Pi)
- Licence: [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- Thinks before answering: yes
- Answers from the library's passages: 14 of 32 right; declined 10 of 13 it should have. 20 of the 45 ended with no answer at all: it spent its whole allowance thinking.
- Looking things up: 15 of 16 right. It answered the boiling question from memory (rightly) instead of from the library.
- Time: first word 11.2 s, whole reply 13.3 s (medians), on that Mac, not on a Pi

### `ornith:9b`: looks things up well

Looks things up well and declines rightly, but slowly, and needs nearly 5 GB.

- Download: 5.6 GB
- Memory while answering here: 4.8 GB
- Suits: a Mac or PC (too large for a Pi)
- Licence: [MIT](https://ollama.com/library/ornith)
- Thinks before answering: yes
- Answers from the library's passages: 20 of 32 right; declined 13 of 13 it should have. 9 of the 45 ended with no answer at all: it spent its whole allowance thinking.
- Looking things up: 15 of 16 right. It answered the boiling question from memory (rightly) instead of from the library.
- Time: first word 10.9 s, whole reply 14.1 s (medians), on that Mac, not on a Pi

## The questions asked to try looking things up

1. What supermarkets are near home?
1. Where is the nearest drinking water?
1. Which hospital is nearest to Northampton?
1. How many days of food have we got?
1. What's on our power cut plan?
1. Are there any weather warnings for us at the moment?
1. What's the river doing?
1. When is sunset at home today?
1. What is the magnetic declination at home?
1. What frequency is the shipping forecast on?
1. How long should I boil water to make it safe to drink?
1. Is there anything on first aid I could download?
1. What pharmacies are there in Bedford?
1. What is the capital of France?
1. Write a haiku about rain.
1. What is the nearest supermarket to home, and what time does the sun set there today?
