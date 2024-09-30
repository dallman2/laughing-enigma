const Loading = () => {
  return (
    <div style={{ width: "100%" }} className="row justify-center align-center">
      <div
        style={{ width: "100%", textAlign: "center" }}
        className="column justify-center align-center"
      >
        <h1>Loading...</h1>
        <sub>
          If you are actually seeing this for more than a split second, <br /> I
          am sorry. OpenCV is a large binary.
        </sub>
      </div>
    </div>
  );
};

export default Loading;
