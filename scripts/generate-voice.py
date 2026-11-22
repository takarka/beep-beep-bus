"""Generate kid-friendly voice prompt MP3s in ru, kk, and en using Microsoft Neural TTS (edge-tts).

Usage:
    pip install edge-tts
    python scripts/generate-voice.py
"""

import asyncio
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parent.parent / "public" / "audio" / "voice"

VOICES = {
    "ru": ("ru-RU-SvetlanaNeural", "+4%", "+6Hz"),
    "kk": ("kk-KZ-AigulNeural", "+4%", "+4Hz"),
    "en": ("en-US-AnaNeural", "+0%", "+0Hz"),
}

PHRASES = {
    "ru": {
        "go": "Поехали!",
        "stop": "Остановка!",
        "redLight": "Красный свет! Стой!",
        "greenLight": "Зелёный! Поехали!",
        "pedestrians": "Осторожно, пешеходы!",
        "stopSign": "Знак стоп! Остановись!",
        "children": "Осторожно, дети!",
        "ambulance": "Скорая! Уступи дорогу!",
        "lowFuel": "Мало бензина! Ищи заправку!",
        "wellDone": "Молодец!",
        "finish": "Ура! Приехали!",
    },
    "kk": {
        "go": "Кеттік!",
        "stop": "Аялдама!",
        "redLight": "Қызыл түс! Тоқта!",
        "greenLight": "Жасыл түс! Кеттік!",
        "pedestrians": "Абай бол, жаяу жүргіншілер!",
        "stopSign": "Тоқта белгісі! Тоқта!",
        "children": "Абай бол, балалар!",
        "ambulance": "Жедел жәрдем! Жол бер!",
        "lowFuel": "Бензин аз! Жанармай құй!",
        "wellDone": "Жарайсың!",
        "finish": "Алақай! Келдік!",
    },
    "en": {
        "go": "Let's go!",
        "stop": "Bus stop!",
        "redLight": "Red light! Stop!",
        "greenLight": "Green light! Go!",
        "pedestrians": "Watch out, pedestrians!",
        "stopSign": "Stop sign! Stop!",
        "children": "Careful, children!",
        "ambulance": "Ambulance! Make way!",
        "lowFuel": "Low fuel! Find a gas station!",
        "wellDone": "Well done!",
        "finish": "Hooray! We arrived!",
    },
}


async def generate_one(lang: str, cue: str, text: str) -> None:
    voice, rate, pitch = VOICES[lang]
    out_dir = ROOT / lang
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{cue}.mp3"
    comm = edge_tts.Communicate(text=text, voice=voice, rate=rate, pitch=pitch)
    await comm.save(str(out_path))
    print(f"OK {lang}/{cue}.mp3 ({out_path.stat().st_size} bytes)")


async def main() -> None:
    sem = asyncio.Semaphore(4)

    async def bounded(lang: str, cue: str, text: str) -> None:
        async with sem:
            await generate_one(lang, cue, text)

    tasks = [
        bounded(lang, cue, text)
        for lang, cues in PHRASES.items()
        for cue, text in cues.items()
    ]
    await asyncio.gather(*tasks)
    print(f"Done: generated {len(tasks)} voice files in {ROOT}")


if __name__ == "__main__":
    asyncio.run(main())
