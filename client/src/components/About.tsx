export function About() {
  return (
    <div className="flex flex-row items-center justify-center font-sans mt-4 w-full">
      <span className="text-neutral-900 text-sm"
        style={{ textShadow: "rgb(255 255 255 / 80%) 0px 0px 2px" }}>
        Click and drag on the image.
      </span>
      <span className="ml-2 mr-1">
        <img src="/hf-logo.svg" alt="Hugging Face" className="w-5 h-5" />
      </span>
      <span className="text-neutral-900 text-sm font-semibold"
        style={{ textShadow: "rgb(255 255 255 / 80%) 0px 0px 2px" }}>
        Hugging Face
      </span>
    </div>
  )
}
