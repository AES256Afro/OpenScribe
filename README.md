# OpenScribe

OpenScribe is a local-first desktop transcription notebook for Windows, macOS, and Linux. It plays imported recordings, transcribes them with local Whisper or OpenAI, and sends the raw transcript only to the AI provider you explicitly select.

There is no OpenScribe subscription, hosted account, or required cloud backend.

## Privacy-first defaults

- Recordings and metadata remain in the operating system's per-user application directory.
- Fresh installs default to local `whisper.cpp` transcription.
- Fresh installs default to a local Ollama model for notes.
- API keys and optional Plaud credentials are encrypted using Electron `safeStorage`.
- Transcripts are not sent to an AI notes provider until the user clicks **Send transcript to AI**.
- Plaud account access is an optional fallback and is never required for local files.

## NotePin S reality

The NotePin S stores recordings locally, but current firmware does not expose them as USB storage. Its BLE/Wi-Fi Fast Transfer protocol is proprietary and the publicly available SDK targets iOS and Android, not desktop operating systems. OpenScribe therefore does not claim that Plaud Cloud sync is a direct Bluetooth connection.

Current paths:

1. **Clean/local:** import an audio file or exported recording and process it without Plaud services.
2. **Experimental device adapter:** reserved for a future open desktop implementation of the BLE/Wi-Fi transfer protocol.
3. **Optional Plaud fallback:** sign in by email verification code and explicitly sync raw recordings from the account. No Plaud transcription or summarization is requested.

Device references: [Plaud USB limitation](https://support.plaud.ai/hc/en-us/articles/53788775968409-Can-I-access-Plaud-NotePin-S-recordings-by-connecting-to-a-PC-via-USB), [Plaud transfer behavior](https://support.plaud.ai/hc/en-us/articles/53640104184985-Transfer-Files), and [Plaud's mobile SDK](https://github.com/Plaud-AI/plaud-sdk-public).

## Transcription choices

- Local [`whisper.cpp`](https://github.com/ggml-org/whisper.cpp), using a user-selected GGML model.
- OpenAI audio transcription with a user-provided [OpenAI Platform API key](https://platform.openai.com/api-keys).

FFmpeg is required for local Whisper audio conversion.

## AI notes choices

- Local Ollama
- Local LM Studio
- OpenAI Responses
- Anthropic Claude Messages
- Google Gemini Generate Content
- OpenRouter and other OpenAI-compatible Chat Completions services

Every provider has an editable base URL and model name. Local endpoints do not require an API key.

## Development

```powershell
pnpm install
pnpm dev
```

Validation:

```powershell
pnpm typecheck
pnpm test
pnpm build
```

Build an installer on the matching operating system:

```powershell
pnpm dist:windows
pnpm dist:macos
pnpm dist:linux
```

The GitHub Actions matrix builds artifacts on native Windows, macOS, and Linux runners.

## Browser extension

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode and choose **Load unpacked**.
3. Select the `extension` directory.
4. Copy the endpoint and companion token from OpenScribe Settings.

The extension can send selected text or a direct page media URL to the localhost-only companion service.

## Acknowledgments

The optional Plaud account adapter follows publicly documented community interoperability behavior pioneered by [Riffado](https://github.com/riffado/riffado). OpenScribe's desktop UI, local-first provider routing, playback workflow, and storage implementation are independent.

OpenScribe is not affiliated with or endorsed by Plaud, OpenAI, Anthropic, Google, Ollama, LM Studio, or OpenRouter. Users are responsible for the terms and privacy policies of any optional provider they enable.
