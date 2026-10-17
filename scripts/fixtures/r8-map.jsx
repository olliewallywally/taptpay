import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';
import { WorldMap } from '../../client/src/pages/admin/Analytics';
const geography = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 554,
      properties: { name: 'New Zealand' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [166, -35],
            [179, -35],
            [179, -47],
            [166, -47],
            [166, -35],
          ],
        ],
      },
    },
  ],
};
function Fixture() {
  const [selected, setSelected] = useState('none');
  const [position, setPosition] = useState({ coordinates: [0, 20], zoom: 1 });
  return (
    <>
      <button onClick={() => setPosition({ coordinates: [172, -41], zoom: 2 })}>
        Zoom to region
      </button>
      <output data-testid="selection">{selected}</output>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 130, center: [0, 20] }}
        style={{ width: '100%', height: 'auto' }}
      >
        <ZoomableGroup
          center={position.coordinates}
          zoom={position.zoom}
          onMoveEnd={setPosition}
        >
          <Geographies geography={geography}>
            {({ geographies }) =>
              geographies.map(geo => (
                <Geography
                  key={geo.rsmKey}
                  data-testid="country"
                  geography={geo}
                  fill="#0055FF"
                  onClick={() => setSelected(geo.properties.name)}
                />
              ))
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>
      <div data-testid="application-map">
        <WorldMap
          countries={[
            { code: 'NZ', users: 1 },
            { code: 'AU', users: 2 },
          ]}
          geography={geography}
        />
      </div>
    </>
  );
}
createRoot(document.getElementById('root')).render(<Fixture />);
