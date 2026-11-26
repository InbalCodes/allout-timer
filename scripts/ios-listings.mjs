// Builds the App Store texts from the Google Play ones: store/listings.json -> store/listings-ios.json + store/listings-ios.md.
// The description is the Play one with the iOS differences applied (no lock-screen buttons, "iPhone", no Google
// product names, Terms/Privacy links at the end, which Apple requires for apps with purchases).
// Name, subtitle, keywords and promo text are written here. Keywords come from the free check of 2026-11-26 (App Store autocomplete + top results per country,
// store/keywords-ios/); there are no popularity numbers behind them.
// Run: node scripts/ios-listings.mjs   (fails if a text is over Apple's limit or a replacement no longer matches)
import { readFile, writeFile } from "node:fs/promises";

const SITE = "https://allout-timer.netlify.app";
const LIMITS = { name: 30, subtitle: 30, keywords: 100, promo: 170, description: 4000 };
const MUSIC = ["Spotify, YouTube Music", "Apple Music, Spotify"];
const MUSIC_JA = ["Spotify、YouTube Music", "Apple Music、Spotify"];

// [Play locale, App Store Connect language, fields, description replacements, footer labels]
const IOS = [
  ["en-US", "English (U.S.)", {
    subtitle: "Workout cues over your music",
    keywords: "tabata,gym,rest,emom,amrap,round,boxing,circuit,running,exercise,training,rep,counter,sets,stopwatch",
    promo: "Beeps and voice cues play over your music without pausing it. Build sets inside sets, by time or by reps. Pro is one purchase, never a subscription.",
  }, [
    ["The timer runs in the background, the cues arrive on time, and Done, Pause, Skip and Stop are on the lock screen.", "The timer runs in the background and the cues arrive on time, even with the screen locked."],
    ["the phone speaker", "the iPhone speaker"], ["Put the phone in your pocket", "Put your iPhone in your pocket"], ["stay on your phone", "stay on your iPhone"],
  ], ["Terms of Use (EULA)", "Privacy Policy"]],
  ["fr-FR", "French", {
    subtitle: "Minuteur sport en musique",
    keywords: "fractionné,chrono,chronomètre,tabata,emom,boxe,course,entrainement,repos,séries,circuit,salle,gym",
    promo: "Bips et annonces vocales par-dessus votre musique, sans la couper. Créez des séries dans des séries, en durée ou en répétitions. Pro : un seul achat, jamais d'abonnement.",
  }, [
    ["Le minuteur tourne en arrière-plan, les signaux arrivent à l'heure, et Terminé, Pause, Passer et Arrêter sont sur l'écran de verrouillage.", "Le minuteur tourne en arrière-plan et les signaux arrivent à l'heure, même écran verrouillé."],
    ["haut-parleur du téléphone", "haut-parleur de l'iPhone"], ["Mettez le téléphone dans la poche", "Mettez l'iPhone dans la poche"], ["restent sur votre téléphone", "restent sur votre iPhone"],
  ], ["Conditions d'utilisation (EULA)", "Politique de confidentialité"]],
  ["de-DE", "German", {
    subtitle: "Ansagen über deiner Musik",
    keywords: "sport,stoppuhr,workout,training,tabata,emom,boxen,box,laufen,runden,pause,sätze,zirkel,fitness",
    promo: "Pieptöne und Ansagen laufen über deiner Musik, ohne sie zu stoppen. Baue Sätze in Sätzen, nach Zeit oder Wiederholungen. Pro ist ein Einmalkauf, nie ein Abo.",
  }, [
    ["Der Timer läuft im Hintergrund, die Signale kommen pünktlich, und Fertig, Pause, Überspringen und Stopp sind auf dem Sperrbildschirm.", "Der Timer läuft im Hintergrund und die Signale kommen pünktlich, auch bei gesperrtem Bildschirm."],
    ["dem Lautsprecher des Handys", "dem Lautsprecher des iPhones"], ["Handy in die Tasche", "iPhone in die Tasche"], ["auf deinem Handy", "auf deinem iPhone"],
  ], ["Nutzungsbedingungen (EULA)", "Datenschutzerklärung"]],
  ["it-IT", "Italian", {
    subtitle: "Segnali sopra la tua musica",
    keywords: "allenamento,palestra,cronometro,tabata,emom,boxe,ripetute,corsa,recupero,serie,circuito,round,sport",
    promo: "Bip e annunci vocali sopra la tua musica, senza fermarla. Crea serie dentro serie, a tempo o a ripetizioni. Pro è un acquisto unico, mai un abbonamento.",
  }, [
    ["Il timer va in background, i segnali arrivano puntuali, e Fatto, Pausa, Salta e Ferma sono sulla schermata di blocco.", "Il timer va in background e i segnali arrivano puntuali, anche a schermo bloccato."],
    ["altoparlante del telefono", "altoparlante dell'iPhone"], ["Metti il telefono in tasca", "Metti l'iPhone in tasca"], ["restano sul telefono", "restano sul tuo iPhone"],
  ], ["Condizioni d'uso (EULA)", "Informativa sulla privacy"]],
  ["ja-JP", "Japanese", {
    subtitle: "音楽を止めないワークアウトタイマー",
    keywords: "タバタ,タバタ式,筋トレ,トレーニング,ラウンド,インターバル走,ランニング,ジム,ボクシング,EMOM,ストップウォッチ,サーキット,休憩,セット,速歩,音声,ストレッチ,腹筋,ダイエット",
    promo: "音楽を止めずに、ビープ音と音声の合図を重ねて再生。時間でも回数でも、セットの中にセットを作れます。Proは買い切りで、サブスクではありません。",
  }, [
    ["タイマーはバックグラウンドで動き、合図は時間どおりに鳴り、「完了」「一時停止」「スキップ」「停止」はロック画面から操作できます。", "タイマーはバックグラウンドで動き、画面をロックしていても合図は時間どおりに鳴ります。"],
    ["スマホのスピーカー", "iPhoneのスピーカー"], ["スマホはポケットへ", "iPhoneはポケットへ"], ["スマホの中だけ", "iPhoneの中だけ"],
  ], ["利用規約 (EULA)", "プライバシーポリシー"]],
  ["ko-KR", "Korean", {
    subtitle: "음악을 멈추지 않는 운동 타이머",
    keywords: "타바타,헬스,홈트,러닝,라운드,복싱,스톱워치,트레이닝,EMOM,휴식,세트,서킷,피트니스,음성,달리기,근력,줄넘기,스트레칭,복근,다이어트,플랭크",
    promo: "음악을 멈추지 않고 비프음과 음성 안내를 얹어 재생합니다. 시간 또는 횟수로, 세트 안의 세트까지 만들 수 있습니다. Pro는 한 번 구매, 구독이 아닙니다.",
  }, [
    ["타이머는 백그라운드에서 돌아가고, 신호는 제때 울리며, 완료·일시정지·건너뛰기·중지는 잠금 화면에서 누를 수 있습니다.", "타이머는 백그라운드에서 돌아가고, 화면이 잠겨 있어도 신호는 제때 울립니다."],
    ["휴대폰 스피커", "iPhone 스피커"], ["휴대폰은 주머니에", "iPhone은 주머니에"], ["휴대폰에만", "iPhone에만"],
  ], ["이용약관 (EULA)", "개인정보 처리방침"]],
  ["pt-BR", "Portuguese (Brazil)", {
    subtitle: "Sinais por cima da sua música",
    keywords: "treino,cronômetro,temporizador,tabata,academia,intervalado,boxe,corrida,emom,esteira,descanso,séries",
    promo: "Bipes e avisos de voz por cima da sua música, sem pausá-la. Monte séries dentro de séries, por tempo ou repetições. O Pro é uma compra única, nunca uma assinatura.",
  }, [
    ["O timer roda em segundo plano, os sinais chegam na hora, e Concluído, Pausar, Pular e Parar ficam na tela de bloqueio.", "O timer roda em segundo plano e os sinais chegam na hora, mesmo com a tela bloqueada."],
    ["o alto-falante do celular", "o alto-falante do iPhone"], ["Coloque o celular no bolso", "Coloque o iPhone no bolso"], ["ficam no seu celular", "ficam no seu iPhone"],
  ], ["Termos de Uso (EULA)", "Política de Privacidade"]],
  ["es-419", "Spanish (Mexico)", {
    subtitle: "Señales sobre tu música",
    keywords: "temporizador,ejercicio,cronómetro,tabata,boxeo,box,gym,entrenamiento,emom,correr,descanso,series",
    promo: "Pitidos y avisos de voz sobre tu música, sin pausarla. Arma series dentro de series, por tiempo o por repeticiones. Pro es una compra única, nunca una suscripción.",
  }, [
    ["El temporizador funciona en segundo plano, las señales llegan a tiempo, y Listo, Pausa, Saltar y Detener están en la pantalla de bloqueo.", "El temporizador funciona en segundo plano y las señales llegan a tiempo, incluso con la pantalla bloqueada."],
    ["la bocina del teléfono", "la bocina del iPhone"], ["Guarda el teléfono en el bolsillo", "Guarda el iPhone en el bolsillo"], ["se quedan en tu teléfono", "se quedan en tu iPhone"],
  ], ["Términos de uso (EULA)", "Política de privacidad"]],
];

const play = JSON.parse(await readFile("store/listings.json", "utf8"));
const len = (s) => [...s].length;
const out = { _about: "App Store texts in the 8 store languages. Generated by scripts/ios-listings.mjs from store/listings.json: edit there, not here." };
let ok = true;
let md = "# Allout Timer: טקסטים ל-App Store\n\nנוצר על ידי `node scripts/ios-listings.mjs`. מעתיקים לכל שפה ב-App Store Connect. מילות המפתח נבחרו לפי הבדיקה החינמית מ-26.11.2026 (`store/keywords-ios/README.md`), בלי מספרי פופולריות.\n";
for (const [locale, asc, fields, reps, [terms, privacy]] of IOS) {
  let description = play[locale].full;
  for (const [from, to] of [locale === "ja-JP" ? MUSIC_JA : MUSIC, ...reps]) {
    if (!description.includes(from)) { console.error(`✗ ${locale}: text not found: ${from}`); ok = false; }
    description = description.replace(from, to);
  }
  description += `\n\n${terms}: ${SITE}/terms/\n${privacy}: ${SITE}/privacy/`;
  const l = { name: play[locale].title, ...fields, description };
  out[locale] = { language: asc, ...l };
  const bad = Object.keys(LIMITS).filter((k) => len(l[k]) > LIMITS[k]);
  const leak = /google|android|lock screen|youtube/i.test(Object.values(l).join(" "));
  if (bad.length || leak) ok = false;
  console.log(`${bad.length || leak ? "✗" : "✓"} ${locale.padEnd(6)} ` + Object.keys(LIMITS).map((k) => `${k} ${len(l[k])}/${LIMITS[k]}`).join("  ") + (bad.length ? "  OVER: " + bad.join(",") : "") + (leak ? "  (mentions another platform)" : ""));
  md += `\n## ${asc} (${locale})\n` + [["Name", "name"], ["Subtitle", "subtitle"], ["Promotional Text", "promo"], ["Keywords", "keywords"], ["Description", "description"]]
    .map(([title, k]) => `**${title}** (${len(l[k])}/${LIMITS[k]})\n\n\`\`\`\n${l[k]}\n\`\`\`\n`).join("");
}
await writeFile("store/listings-ios.json", JSON.stringify(out, null, 2) + "\n");
await writeFile("store/listings-ios.md", md);
process.exit(ok ? 0 : 1);
