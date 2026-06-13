import Link from "next/link";

export default function GuestRemovedPage() {
  return (
    <main className="host-root">
      <div className="host-main" style={{ maxWidth: 720, margin: "0 auto", paddingTop: 80 }}>
        <section className="newcard">
          <h1 style={{ marginTop: 0 }}>Guest screen removed</h1>
          <p>
            Public guest links are no longer used. Open the private display from the host controller.
          </p>
          <Link className="hbtn hbtn--primary" href="/host">
            Back to host
          </Link>
        </section>
      </div>
    </main>
  );
}
