/** 本人の手で止まっているプロジェクト1つ分。載せるのはプロジェクト名と止まっているタスクだけ（docs/decisions.md「本人待ちの表示」）。 */
export type BlockedProject = {
    name: string;
    tasks: string[];
};

/**
 * 画面の見た目を確かめるための仮のデータ。保存先（テーブル）を作るまで `npm run dev` のときだけ出す。
 * 中身は 2026-10-21 時点の各リポジトリの「本人待ち」から写した例。
 */
export const MOCK_BLOCKED_PROJECTS: BlockedProject[] = [
    { name: 'product-sales', tasks: ['公開前の未定値6件を埋める', '製品02・03の名前を決める'] },
    { name: 'duocad', tasks: ['試し刷り TP1 を1回刷って、結果を返す'] },
    { name: 'romaji-slm', tasks: ['常駐入力を普段のアプリで使って、使用状況を貼る', '資源削減の3件を選ぶ'] },
];
