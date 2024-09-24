mkdir $1
touch $1/$1.tsx
touch $1/$1.css

echo export { default } from \'./$1.tsx\' > $1/index.ts