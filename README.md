# 🎨 Rang Manga Editor

अपनी **manga / anime तस्वीर upload करें और लिखकर बताएँ कि क्या बदलना है**। इसके दो रूप हैं:

1. **Rang Manga Android ऐप** (नीचे देखें): तेज़, हर edit कुछ सेकंड में। हर edit पर थोड़ा पैसा लगता है।
2. **Free notebook** (`RangMangaEditor.ipynb`): free GPU (Kaggle या Google Colab) पर चलता है, पर धीमा है।

## 📱 Rang Manga ऐप

**Install:** इस repo के **Releases** पेज से नया `RangManga-v1.0.x.apk` डाउनलोड करके खोलें। हर push पर GitHub अपने-आप नया APK बनाता है।

**पहली बार:** ऐप में **Settings** खोलें और एक key डालें:
- **OpenRouter key** (FLUX 3 Klein): [openrouter.ai/keys](https://openrouter.ai/keys) पर बनाएँ, थोड़ा credit डालें। हर edit लगभग $0.008।
- **fal key** (Qwen Edit 2511, manga add-ons के साथ): [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys)। हर edit लगभग $0.03–0.04।

Key सिर्फ़ आपके फ़ोन में रहती है, ऐप के code या इस repo में नहीं।

**इस्तेमाल:** तस्वीर चुनें → Quick edit या "What should change?" में लिखें → **Edit picture**। हर edit पिछले result पर होता है। **Undo**, **Hold: before** (पहले वाली तस्वीर देखें), **Save** (Pictures › Rang Manga), Gallery में **Share / Edit more**। "Add extra pictures" से characters को scene में डालें।

> 🔒 Adult/sexual edits रोके जाते हैं: ऐप में text filter, और दोनों सेवाओं के अपने safety filters।

> Clients को ऐप देना हो तो key ऐप में मत डालिए। उसके लिए एक छोटा server (जैसे Supabase Edge Function) चाहिए जो key अपने पास रखे।

## 📓 Free notebook

## क्या-क्या कर सकते हैं
- **लिखकर edit:** *"Make her hair red"*, *"Give him a sword"*, *"Change the background to a night city"*
- **Quick edits:** रंग भरना, black & white + screentone, speech bubble का text हटाना, photo → anime, anime style, चेहरे का भाव, pose, camera angle, noir comic panel, sharpen
- **Characters को scene में डालना:** कमरे की तस्वीर + characters की तस्वीरें दें और लिखें वो क्या कर रहे हैं
- **बार-बार edit:** हर edit पिछले result पर होता है। Undo के लिए पुरानी edit का नंबर चुनें
- **Before / After** साथ में दिखता है। Edits Google Drive (Colab) या Kaggle Output में save होती हैं
- 🔒 **Safety filter हमेशा चालू:** adult/sexual edits, uploads और results रोके जाते हैं

## Engines
| Engine | कहाँ चलेगा | खास बात |
|---|---|---|
| **Qwen Image Edit 2511** + Lightning (4/8 steps) | Kaggle (~30 GB RAM) | manga के लिए सबसे अच्छा; add-ons: Manga tone, Anime, Photo→anime, Camera angle, Noir panel, Sharpen |
| **FLUX 3 Image Klein** (16 steps) | Colab या Kaggle | हल्का; 10 तस्वीरें तक साथ जोड़ सकता है |

`ENGINE = Auto` मशीन देखकर अपने-आप चुनता है। समय (अनुमान): free T4 पर हर तस्वीर 1–5 मिनट। पहली बार model download में 10–20 मिनट और लगते हैं।

## शुरू करें

### Kaggle (सबसे अच्छा)
1. kaggle.com पर account बनाएँ और phone number verify करें।
2. **Create → Notebook → File → Import Notebook → GitHub**, फिर `sanjeevraja091-blip/manga-editor` → `RangMangaEditor.ipynb`
3. **Settings → Accelerator → GPU T4 x2**, और **Internet → On**
4. Step 1 ▶ → Step 2 ▶ (फ़ोटो चुनें) → Step 3 में बदलाव लिखें ▶

### Google Colab
1. खोलें: `https://colab.research.google.com/github/sanjeevraja091-blip/manga-editor/blob/main/RangMangaEditor.ipynb`
2. **Runtime → Change runtime type → T4 GPU**
3. Step 1 ▶ (Drive की अनुमति दें) → Step 2 ▶ → Step 3 ▶

## License और credits
- इस repo का notebook: Apache License 2.0 (`LICENSE`)
- WanGP: WanGP Community License. Free, निजी इस्तेमाल; बेचना या पैसे लेकर सेवा देना मना है
- Qwen-Image-Edit-2511 और Lightning LoRA: Apache 2.0
- FLUX 3 Image Klein: FLUX Kommunity License (commercial सिर्फ़ $5M से कम कमाई वालों के लिए, content filter की शर्त के साथ)
- Manga add-on LoRAs: हर एक का अपना license। Clients के काम से पहले जाँच लें

पूरी जानकारी `NOTICE` में है। Rang Manga Editor इन projects का बनाया या समर्थित नहीं है।
