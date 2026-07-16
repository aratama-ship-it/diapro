# カード中央イラスト・簡易ガイドライン（Lite）

最初からガチガチに縛らず、**まず1〜2枚作り、良ければそれを基準に作風を固定していく**方針。
このメモは最低限の枠だけ。詳細版は [2026-07-16-card-art-prompt-spec.md](2026-07-16-card-art-prompt-spec.md)（参照用に温存。今は未適用）。

## 守ってほしいのはこれだけ
1. **アスペクト比**：横長 **約2:1**（アート枠は DOM 約280×150 / 書き出し 592×300）。
   16:9 や 3:2 の横長でもOK（`object-fit: cover` で表示するため、上下が少しトリミングされる前提で中央に余白を）。
2. **色**：クール基調（青／シアン／ネイビー系）でまとめる。※あくまで目安。厳密なhex固定はしない。
   - 参考トーン：ディープネイビー〜スチールブルーを背景、シアン〜氷白を発光・ハイライトに。
3. **被写体**：ディアボロ（2つの椀＋中央軸＋2本のスティック＋紐）が主役で分かること。
4. **文字を入れない**：画像内にロゴ・文字・数字・ウォーターマークを描かない（カード側で文字を載せるため）。

## 縛らないこと（自由でOK）
- 画風（イラスト/半写実/アニメ等）、タッチ、構図、エフェクト、mood、背景の作り込み具合。
- ディアボロの厳密な比率や色の完全一致。人物の有無など。
→ 1〜2枚で「これ」という方向が出たら、その特徴を後から言語化して固定する。

## 方針：50枚それぞれ固有の絵にする
全50カードを1枚ずつ個別イラストにする（＝カードID単位）。差し込み口はID基準に配線済み。
未登録のカードは従来どおり属性TypeのSVG表示のまま（表示・保存・シェア対応済み）。

## 差し込み方（作った画像の入れ方）
1. 画像を `assets/cards/<カードID>.png` に置く（例：`assets/cards/sp_worlds.png`）
2. `js/app.js` の `CARD_IMAGE` に1行足す（例：`sp_worlds: 'assets/cards/sp_worlds.png',`）
3. 未登録カードはSVGのまま。1枚ずつ差し替わっていく

## 全50枚チェックリスト（カードID／タイトル／意味）
作った画像の `assets/cards/<ID>.png` 名はこのIDに合わせる。

### 特別カード（15）
| ID | タイトル | 意味 |
|---|---|---|
| `sp_worlds` | 伝説のディアボリスト | 世界大会 優勝（最高峰） |
| `sp_grandslam` | グランドスラム | 全部門制覇 |
| `sp_dynasty` | 絶対王者 | 全日本 2連覇 |
| `sp_ajdc` | 日本の頂点 | 全日本 優勝 |
| `sp_jjf` | 祭典の主役 | JJF決勝 優勝 |
| `sp_weed` | 雑草の大器 | ハードでS（叩き上げ） |
| `sp_upset` | 下剋上 | ハードでB/A |
| `sp_daikyo` | 大凶返し | 大凶の年にA以上 |
| `sp_awakener` | 覚醒者 | 覚醒3回以上 |
| `sp_tokai` | 東海二冠 | 静岡2部門優勝 |
| `sp_elite` | 英才教育の結晶 | イージーでS＋多勝 |
| `sp_unhurt` | 無傷の四年間 | 無怪我で完走 |
| `sp_scholar` | 文武両道 | 学力90＋高ランク |
| `sp_podium` | 表彰台の常連 | 表彰台率が高い |
| `sp_expelled` | 未完の大器 | 退学（GAME OVER） |

### 職人カード（5）
| ID | タイトル | 意味 |
|---|---|---|
| `cr_h1d` | 水平の匠 | 1DH部門を極める |
| `cr_v1d` | 垂直の踊り手 | 1DV部門を極める |
| `cr_d2` | 双皿の遣い手 | 2D部門を極める |
| `cr_d3` | 三連の魔術師 | 3D+部門を極める |
| `cr_worlds` | 世界への挑戦者 | 世界大会入賞 |

### ランク×属性マトリクス（30）
属性: power=高難度 / innovator=イノベーター / technician=テクニシャン / showman=ショーマン / allround=万能

| ランク | power | innovator | technician | showman | allround |
|---|---|---|---|---|---|
| **S** | `mx_S_power` 極限の求道者 | `mx_S_innovator` 時代の革命児 | `mx_S_technician` 精密機械 | `mx_S_showman` 舞台の支配者 | `mx_S_allround` 完全無欠 |
| **A** | `mx_A_power` 剛技の使い手 | `mx_A_innovator` 孤高の発明家 | `mx_A_technician` 熟練の職人 | `mx_A_showman` 華の演者 | `mx_A_allround` 万能の実力者 |
| **B** | `mx_B_power` 力技の人 | `mx_B_innovator` 奇手の使い手 | `mx_B_technician` 堅実な技巧派 | `mx_B_showman` 魅せる人 | `mx_B_allround` 器用な選手 |
| **C** | `mx_C_power` 挑戦者 | `mx_C_innovator` 工夫の人 | `mx_C_technician` コツコツ職人 | `mx_C_showman` ムードメーカー | `mx_C_allround` バランサー |
| **D** | `mx_D_power` 無鉄砲 | `mx_D_innovator` 夢追い人 | `mx_D_technician` 反復の虫 | `mx_D_showman` 目立ちたがり | `mx_D_allround` 発展途上 |
| **E** | `mx_E_power` 無謀な情熱 | `mx_E_innovator` 空想家 | `mx_E_technician` 素振りの日々 | `mx_E_showman` お祭り好き | `mx_E_allround` 青春の一ページ |

## 進め方
1〜2枚できたら私に渡す → 実カードにはめて見え方を確認 → 良ければ「この作風で固定」の指針を（このLiteに）追記していく。
