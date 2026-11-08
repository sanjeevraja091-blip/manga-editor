# 🎨 Rang Manga Editor

अपनी **manga / anime तस्वीर upload करें और लिखकर बताएँ कि क्या बदलना है**। ये free GPU (Kaggle या Google Colab) पर चलता है, फ़ोन के browser से।

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
