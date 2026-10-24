# 経穴データの出典と表示範囲

## 標準の範囲

WHO Regional Office for the Western Pacific, *WHO standard acupuncture point locations in the Western Pacific region*, 2008（2009年更新・再版）, ISBN 9789290613831。

https://iris.who.int/handle/10665/353407

対象は14経脈の361穴です。LU11、LI20、ST45、SP21、HT9、SI19、BL67、KI27、PC9、TE23、GB44、LR14、GV28、CV24。コード集合を公式資料と照合しました。国・教材に見られる別コードは検索のための別表記として扱い、標準表示は上記コードです。追加番号 GV24+（印堂）はこの361穴には含めていません。

WHOの図版・本文や3D座標を再配布したものではありません。今回確認できたWHO資料は標準名称・コードと位置決定の文書資料であり、当アプリの3D座標はWHOの提供・認証・監修を受けたものではありません。

## 日本語の漢字名と読み

日本語版Wikipediaの各経脈の記事と、その執筆者・編集者に帰属します。各レコードの `sources` と `catalog.json` の `sources` に、記事名と取得版の固定リンクを記録しています。名称・読みをWHOコードで再配列し、コード別名検索と3D表示を追加しました。

ライセンス: CC BY-SA 4.0
https://creativecommons.org/licenses/by-sa/4.0/

漢字の許容表記・旧字体や読みには資料間の差異があります。日本語の表示とWHOのコードを同じカードに示し、検索では一部の異体字も扱います。医学的な全件監修を受けた日本語用語集ではありません。

## 3D位置の元データ

JIC contributors / JICio/tcm-3d の `app/teaching-points.json` と `app/meridian-surface.json` を元にしています。

https://github.com/JICio/tcm-3d

元データは同プロジェクトが明記する「generated / reviewed: false」の教育用座標です。原創座標はMITライセンスです。MIT著作権表示を [acupoint-positions-MIT.txt](../licenses/acupoint-positions-MIT.txt) に同梱しています。元データは BodyParts3D 上に適応されたものです。

当アプリではWHOの361コードに限定し、日本語名を結合し、BodyParts3Dのこのリポジトリの皮膚メッシュFJ2810に再投影しています。左右または中線の669体表マーカーを保存しています。再投影で確認するのはメッシュとの接触であり、経穴の標準位置・骨度法・体位・解剖学的精度の確認ではありません。

齦交（GV28）は口腔内の穴で、口を開けない体表モデルの顔面には置かず、対応表と説明のみ提供します。任脈・督脈は中線、その他は左右の表示です。正中線付近にも個体差があり、図は単一の成人男性参照モデルです。

## 人体モデル

BodyParts3D 4.0, © The Database Center for Life Science, CC BY 4.0。
https://creativecommons.org/licenses/by/4.0/

詳細な人体モデルの出典・加工内容は [ATTRIBUTION.md](../ATTRIBUTION.md) を参照してください。

## 再配布

日本語名・読みと図示用座標を結合した `catalog.json` とリポジトリの `data/acupoint-seeds.json` の派生データは、上記各出典・著作権表示を維持し、CC BY-SA 4.0で公開します。WHOの刊行物の権利まで再許諾するものではありません。

この機能は漢字名と国際コードの対応・おおまかな部位を学ぶためのものです。3Dマーカーを施術の位置決定、刺入位置・深度や治療判断に使うことは想定していません。効能、治療推奨、刺入方法は収録していません。
