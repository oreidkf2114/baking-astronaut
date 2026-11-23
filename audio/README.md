# 앰비언트 음원 교체

이 폴더에 `ambient.mp3` 를 넣으면 체험 내내 그 파일이 루프로 재생되고,
기본 내장 앰비언트(브라우저 생성 패드)는 1/4 볼륨으로 물러납니다. 파일이 없으면 내장 앰비언트만 재생됩니다.

- 파일명은 반드시 `ambient.mp3`
- 권장: 2~4분, 처음과 끝이 이어지는 루프, 드럼 없는 저음 위주 패드 (효과음·내레이션이 위에 얹힙니다)
- ElevenLabs Music 등에서 만들 때 프롬프트 예시:
  `slow evolving dark ambient drone, deep space, warm analog pads, subtle bubbling fermentation textures, no drums, no melody, seamless loop, 60 bpm`
- 볼륨은 `js/core.js` 의 `this.file.volume = ... 0.55` 값으로 조절
