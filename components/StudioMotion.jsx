"use client";

import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export default function StudioMotion({ children }) {
  const scopeRef = useRef(null);

  useLayoutEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return undefined;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) {
      scope.classList.add("motion-reduced");
      return undefined;
    }

    let removeStagePointer = () => {};
    const magneticCleanups = [];
    let lenis;
    let lenisTick;
    let removeLenisScroll = () => {};

    const context = gsap.context(() => {
      lenis = new Lenis({
        autoRaf: false,
        anchors: true,
        lerp: 0.085,
        smoothWheel: true,
      });

      const onLenisScroll = () => ScrollTrigger.update();
      lenis.on("scroll", onLenisScroll);
      removeLenisScroll = () => lenis?.off?.("scroll", onLenisScroll);
      lenisTick = (time) => lenis?.raf(time * 1000);
      gsap.ticker.add(lenisTick);
      gsap.ticker.lagSmoothing(0);

      const revealItems = gsap.utils.toArray(
        "[data-reveal]:not(.hero-copy):not(.hero-stage)",
        scope,
      );

      gsap.set(revealItems, { autoAlpha: 0, y: 28 });
      revealItems.forEach((element, index) => {
        gsap.to(element, {
          autoAlpha: 1,
          y: 0,
          delay: Math.min(index * 0.06, 0.28),
          duration: 1.05,
          ease: "power4.out",
          scrollTrigger: {
            trigger: element,
            start: "top 88%",
            once: true,
          },
        });
      });

      const topbar = scope.querySelector(".topbar");
      const hero = scope.querySelector(".hero");
      const heroRail = scope.querySelector(".hero-rail");
      const heroCopy = scope.querySelector(".hero-copy");
      const heroStage = scope.querySelector(".hero-stage");
      const titleLines = gsap.utils.toArray(".hero-title-line", scope);

      if (topbar && hero && heroCopy && heroStage) {
        gsap
          .timeline({ defaults: { ease: "power4.out" } })
          .fromTo(
            topbar,
            { autoAlpha: 0, y: -18 },
            { autoAlpha: 1, y: 0, duration: 0.72 },
          )
          .fromTo(
            hero,
            { clipPath: "inset(0 0 100% 0)" },
            { clipPath: "inset(0 0 0% 0)", duration: 1.12 },
            "-=0.34",
          )
          .fromTo(
            heroRail,
            { autoAlpha: 0, scaleX: 0, transformOrigin: "left center" },
            { autoAlpha: 1, scaleX: 1, duration: 0.62 },
            "-=0.48",
          )
          .fromTo(
            heroCopy,
            { autoAlpha: 0, y: 30 },
            { autoAlpha: 1, y: 0, duration: 0.82 },
            "-=0.28",
          )
          .fromTo(
            titleLines,
            { autoAlpha: 0, yPercent: 115, rotateX: -70 },
            {
              autoAlpha: 1,
              yPercent: 0,
              rotateX: 0,
              duration: 0.9,
              stagger: 0.08,
              transformOrigin: "50% 100%",
            },
            "-=0.52",
          )
          .fromTo(
            heroStage,
            { autoAlpha: 0, clipPath: "inset(0 0 0 100%)" },
            { autoAlpha: 1, clipPath: "inset(0 0 0 0%)", duration: 1.05 },
            "-=0.72",
          );
      }

      const stage = scope.querySelector("[data-pointer-zone]");
      if (stage) {
        const pointerTargets = Array.from(stage.querySelectorAll("[data-pointer]")).map(
          (element) => ({
            element,
            xTo: gsap.quickTo(element, "x", {
              duration: 0.7,
              ease: "power3.out",
            }),
            yTo: gsap.quickTo(element, "y", {
              duration: 0.7,
              ease: "power3.out",
            }),
            strength: Number(element.dataset.pointerStrength || 12),
          }),
        );

        const onPointerMove = (event) => {
          const bounds = stage.getBoundingClientRect();
          const x = (event.clientX - bounds.left) / bounds.width - 0.5;
          const y = (event.clientY - bounds.top) / bounds.height - 0.5;

          pointerTargets.forEach(({ xTo, yTo, strength }) => {
            xTo(x * strength);
            yTo(y * strength);
          });
        };

        const onPointerLeave = () => {
          pointerTargets.forEach(({ xTo, yTo }) => {
            xTo(0);
            yTo(0);
          });
        };

        stage.addEventListener("pointermove", onPointerMove);
        stage.addEventListener("pointerleave", onPointerLeave);
        removeStagePointer = () => {
          stage.removeEventListener("pointermove", onPointerMove);
          stage.removeEventListener("pointerleave", onPointerLeave);
        };

        const scene = stage.querySelector(".stage-scene");
        if (scene) {
          gsap.to(scene, {
            y: -90,
            scale: 0.88,
            ease: "none",
            scrollTrigger: {
              trigger: stage,
              start: "top 15%",
              end: "bottom top",
              scrub: 1.1,
            },
          });
        }
      }

      const scrubPanels = gsap.utils.toArray("[data-scrub-panel]", scope);
      scrubPanels.forEach((panel) => {
        gsap.fromTo(
          panel,
          { clipPath: "inset(9% 0 9% 0 round 1px)", y: 44 },
          {
            clipPath: "inset(0% 0 0% 0 round 1px)",
            y: 0,
            ease: "none",
            scrollTrigger: {
              trigger: panel,
              start: "top 94%",
              end: "top 34%",
              scrub: 1,
            },
          },
        );
      });

      const orbitOne = scope.querySelector(".stage-orbit-one");
      const orbitTwo = scope.querySelector(".stage-orbit-two");
      const stageOrb = scope.querySelector(".stage-orb");
      const marquee = scope.querySelector(".signal-marquee");

      if (orbitOne) {
        gsap.to(orbitOne, {
          rotation: 360,
          duration: 26,
          ease: "none",
          repeat: -1,
        });
      }
      if (orbitTwo) {
        gsap.to(orbitTwo, {
          rotation: -360,
          duration: 18,
          ease: "none",
          repeat: -1,
        });
      }
      if (stageOrb) {
        gsap.to(stageOrb, {
          y: -13,
          scale: 1.045,
          duration: 2.7,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        });
      }
      if (marquee) {
        gsap.to(marquee, {
          xPercent: -24,
          duration: 18,
          ease: "none",
          repeat: -1,
        });
      }

      const magneticItems = gsap.utils.toArray("[data-magnetic], .button", scope);
      magneticItems.forEach((element) => {
        const xTo = gsap.quickTo(element, "x", {
          duration: 0.35,
          ease: "power3.out",
        });
        const yTo = gsap.quickTo(element, "y", {
          duration: 0.35,
          ease: "power3.out",
        });

        const onMove = (event) => {
          const bounds = element.getBoundingClientRect();
          xTo((event.clientX - (bounds.left + bounds.width / 2)) * 0.12);
          yTo((event.clientY - (bounds.top + bounds.height / 2)) * 0.16);
        };
        const onLeave = () => {
          xTo(0);
          yTo(0);
        };

        element.addEventListener("pointermove", onMove);
        element.addEventListener("pointerleave", onLeave);
        magneticCleanups.push(() => {
          element.removeEventListener("pointermove", onMove);
          element.removeEventListener("pointerleave", onLeave);
        });
      });
    }, scope);

    return () => {
      removeStagePointer();
      magneticCleanups.forEach((cleanup) => cleanup());
      removeLenisScroll();
      if (lenisTick) gsap.ticker.remove(lenisTick);
      lenis?.destroy?.();
      context.revert();
    };
  }, []);

  return (
    <div className="studio-motion" ref={scopeRef}>
      {children}
    </div>
  );
}
