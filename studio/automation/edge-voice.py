"""Small JSON/stdio bridge to edge-tts. No account credentials or paid API keys."""
import asyncio
import html
import importlib.metadata
import json
import pathlib
import sys


async def main():
    import edge_tts

    request = json.load(sys.stdin)
    action = request.get("action", "probe")
    if action == "probe":
        print(json.dumps({"version": importlib.metadata.version("edge-tts")}))
        return
    if action == "voices":
        voices = await asyncio.wait_for(edge_tts.list_voices(), timeout=25)
        selected = [{"name": voice["ShortName"], "locale": voice["Locale"], "gender": voice.get("Gender")} for voice in voices if voice.get("Locale") == "id-ID"]
        if not selected:
            raise RuntimeError("Layanan tidak menawarkan suara id-ID saat ini")
        print(json.dumps({"voices": selected}, ensure_ascii=False))
        return
    if action != "synthesize":
        raise ValueError("Unsupported voice action")
    voice = request["voice"]
    if not voice.startswith("id-ID-"):
        raise ValueError("Suara harus menggunakan locale id-ID")
    output = pathlib.Path(request["output"])
    metadata = pathlib.Path(request["metadata"])
    output.parent.mkdir(parents=True, exist_ok=True)
    words = []
    audio_bytes = 0
    communication = edge_tts.Communicate(request["text"], voice, rate="+0%", boundary="WordBoundary")
    with output.open("wb") as stream:
        async for chunk in communication.stream():
            if chunk["type"] == "audio":
                stream.write(chunk["data"])
                audio_bytes += len(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start = float(chunk["offset"]) / 10_000_000
                words.append({"text": html.unescape(chunk["text"]), "start": start, "end": start + float(chunk["duration"]) / 10_000_000})
    if audio_bytes < 1000 or not words:
        raise RuntimeError("Layanan tidak mengembalikan audio dan word boundaries yang lengkap")
    metadata.write_text(json.dumps({"voice": voice, "words": words, "bytes": audio_bytes}, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"voice": voice, "bytes": audio_bytes, "words": len(words)}))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        # Do not dump transport headers, URLs with query tokens, or credentials.
        print(f"{type(error).__name__}: {str(error).split('?')[0][:400]}", file=sys.stderr)
        sys.exit(1)
