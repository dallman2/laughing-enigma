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

  // maybe on production idk about dev
  // const alreadyPersisted = await navigator.storage.persisted()
  // let persistenceGranted = false
  // if (!alreadyPersisted) {
  //   const persistenceGranted = await navigator.storage.persist()
  //   if (!persistenceGranted) {
  //     console.error('unable to persist storage')
  //     alert('Unable to save calibration results to disk. Allow this site to use persistent storage in your browser settings.')
  //     return
  //   }
  // } else {
  //   persistenceGranted = true
  // }

  // if (persistenceGranted) {
  //   const est = await navigator.storage.estimate()
  //   const dirHandle = await navigator.storage.getDirectory()
  //   console.log('storageHandle', est, dirHandle)
  // }
}