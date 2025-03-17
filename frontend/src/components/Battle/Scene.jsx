import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

export const Scene = () => {
    return (
        <Canvas
            camera={{
                fov: 75,
                near: 0.1,
                far: 1000,
                position: [15, 15, 15], // Камера под углом для лучшего восприятия 3D
            }}
            style={{ background: '#f0f0f0' }}
            shadows // Включаем тени
        >
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={0.5} castShadow />
            <directionalLight
                position={[10, 10, 10]}
                intensity={1.0}
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
            />

            <mesh position={[0, 0, 0]} castShadow receiveShadow>
                <boxGeometry args={[5, 5, 5]} /> {/* Уменьшил размер куба для лучшего восприятия */}
                <meshStandardMaterial color="hotpink" />
            </mesh>

            <OrbitControls
                enablePan={true}
                enableZoom={true}
                enableRotate={true}
            />
        </Canvas>
    );
};