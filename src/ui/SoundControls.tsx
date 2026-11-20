import { useEffect, useState } from "react";
import { Music, Volume2, VolumeX } from "lucide-react";
import { gameAudio } from "./audio";

/** Music and sound toggles; preferences persist per browser. */
export default function SoundControls({ ru }: { ru: boolean }) {
  const [prefs, setPrefs] = useState(gameAudio.prefs);
  useEffect(() => {
    gameAudio.installUnlock();
    return gameAudio.subscribe(() => setPrefs({ ...gameAudio.prefs }));
  }, []);
  return (
    <div className="sound-controls">
      <button
        className={`icon-button ${prefs.music ? "on" : "off"}`}
        aria-pressed={prefs.music}
        title={ru ? "Музыка в меню" : "Menu music"}
        aria-label={ru ? "Музыка в меню" : "Menu music"}
        onClick={() => gameAudio.setPrefs({ music: !prefs.music })}
      >
        <Music size={16} />
      </button>
      <button
        className={`icon-button ${prefs.sound ? "on" : "off"}`}
        aria-pressed={prefs.sound}
        title={ru ? "Звук" : "Sound"}
        aria-label={ru ? "Звук" : "Sound"}
        onClick={() => gameAudio.setPrefs({ sound: !prefs.sound })}
      >
        {prefs.sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
      </button>
    </div>
  );
}
