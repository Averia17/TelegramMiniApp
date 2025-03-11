import React from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { TextureLoader } from 'three';
import { Stars } from '@react-three/drei';

const Tile = ({ position, texture }) => {
  return (
    <mesh position={position}>
      <boxGeometry args={[1, 1, 0.1]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  );
};


const Map = () => {
  const texture = useLoader(TextureLoader, '/images/grass.jpg');

  const tiles = [];
  const mapSize = 10;

  for (let x = 0; x < mapSize; x++) {
    for (let y = 0; y < mapSize; y++) {
      tiles.push(<Tile key={`${x}-${y}`} position={[x - mapSize / 2, y - mapSize / 2, 0]} texture={texture} />);
    }
  }

  return <>{tiles}</>;
};

export const Scene = () => {
  return (
    <Canvas
      orthographic
      camera={{
        position: [0, 0, 0],
      }}
    >
      <Map />
    </Canvas>
  );
};
