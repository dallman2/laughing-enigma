import { DistMapsAndQ } from "./gfx_state";

export const saveCalibResultsToDisk = async (calibResults: DistMapsAndQ, filename: string) => {
  const { l, r, q } = calibResults;
  const data = {
    l: {
      map1: l.map1.data16S.toString(),
      map2: l.map2.data16S.toString()
    },
    r: {
      map1: r.map1.data16S.toString(),
      map2: r.map2.data16S.toString()
    },
    q: q.data32F
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}
