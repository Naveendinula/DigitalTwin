import React, { useEffect } from 'react'
import { ensureStyleInjected } from '../utils/styleInjection'

/**
 * Button Component
 * 
 * Tactical/soft-ui button design with LED support.
 * 
 * @param {string} href - Optional link target
 * @param {function} onClick - Click handler
 * @param {boolean} selected - Active state
 * @param {boolean} disabled - Disabled state
 * @param {boolean} block - Full width
 * @param {string} color - Theme color (primary, secondary, tertiary, neutral, default)
 * @param {React.ReactNode} children - Button content
 */
export const Button = ({
  children,
  onClick,
  className = "",
  selected = false,
  disabled = false,
  block = false,
  color = "default",
  href,
  title,
  ...restProps
}) => {
  const TagName = href ? "a" : "div"
  
  const handleClick = (evt) => {
    if (!disabled && onClick) {
      onClick(evt)
    }
  }

  const handleKeydown = (evt) => {
    if (!disabled && ["Enter", " "].includes(evt.key)) {
      onClick?.(evt)
    }
  }

  // Inject styles if not present
  useEffect(() => {
    ensureStyleInjected('tactile-button-styles', buttonStyles)
  }, [])

  return (
    <TagName
      className={`tactile-btn ${className}`}
      data-color={color}
      data-block={block ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      data-disabled={disabled ? "true" : undefined}
      onKeyDown={disabled ? undefined : handleKeydown}
      onClick={disabled ? undefined : handleClick}
      href={href}
      role="button"
      tabIndex={disabled ? -1 : 0}
      title={title}
      {...restProps}
    >
      <div className="tactile-btn-content">
        {children}
      </div>
    </TagName>
  )
}

const buttonStyles = `
        .tactile-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          flex-wrap: wrap;
          border-radius: 12px;
          padding: 10px 16px;
          background: #ffffff;
          color: #1d1d1f;
          cursor: pointer;
          user-select: none;
          box-shadow: 
            rgb(255, 255, 255) 1px 1px 1px 0px inset,
            rgba(0, 0, 0, 0.15) -1px -1px 1px 0px inset,
            rgba(0, 0, 0, 0.26) 0.444584px 0.444584px 0.628737px -1px,
            rgba(0, 0, 0, 0.247) 1.21072px 1.21072px 1.71222px -1.5px,
            rgba(0, 0, 0, 0.23) 2.6583px 2.6583px 3.75941px -2.25px,
            rgba(0, 0, 0, 0.192) 5.90083px 5.90083px 8.34503px -3px,
            rgba(0, 0, 0, 0.056) 10px 10px 21.2132px -3.75px,
            -0.5px -0.5px 0 0 rgb(0 0 0 / 5%);
          transition: all 0.2s ease;
          font-family: inherit;
          font-size: 13px;
          font-weight: 500;
          outline: none;
          position: relative;
          min-width: 80px;
          border: none;
        }

        /* Hover State - Minimal change to preserve heavy shadow */
        .tactile-btn:hover:not([data-disabled="true"]) {
          background: #fafafa;
        }

        /* Active/Selected State */
        .tactile-btn:active,
        .tactile-btn[data-selected="true"] {
          background: #eaeaea;
          transform: scale(0.98);
          box-shadow: 
            inset 0.5px 0.5px 1px #fff, 
            inset -0.5px -0.5px 1px #00000026,
            0.222px 0.222px 0.314px -0.5px #0003,
            0.605px 0.605px 0.856px -1px #0000002e,
            1.329px 1.329px 1.88px -1.5px #00000040,
            2.95px 2.95px 4.172px -2px #0000001a, 
            2.5px 2.5px 3px -2.5px #00000026,
            -0.5px -0.5px 0 0 rgb(0 0 0 / 10%);
        }

        /* Primary Color */
        .tactile-btn[data-color="primary"] {
          color: #fff;
          background: #ff6b35;
          box-shadow: inset 1px 1px 1px #ffffffd4, inset -1px -1px 1px #0000003b,
            0.444584px 0.444584px 0.628737px -1px #00000042,
            1.21072px 1.21072px 1.71222px -1.5px #0000003f,
            2.6583px 2.6583px 3.75941px -2.25px #0000003b,
            5.90083px 5.90083px 8.34503px -3px #00000031,
            10px 10px 21.2132px -3.75px #0000003b, -0.5px -0.5px #952b0087;
        }

        .tactile-btn[data-color="primary"]:active,
        .tactile-btn[data-color="primary"][data-selected="true"] {
          box-shadow: inset 0.5px 0.5px 1px #fff, inset -0.5px -0.5px 1px #0000005b,
            0.222px 0.222px 0.314px -1px #0003,
            0.605px 0.605px 0.856px -1px #0000002e,
            1.329px 1.329px 1.88px -1.5px #00000040,
            2.95px 2.95px 4.172px -2px #0000001a, 2.5px 2.5px 3px -2.5px #00000026,
            -0.5px -0.5px #00000022;
        }

        /* Secondary Color */
        .tactile-btn[data-color="secondary"] {
          color: #fff;
          background: #222;
          box-shadow: inset 1px 1px 1px #ffffffb3, inset -1px -1px 1px #0000003b,
            0.444584px 0.444584px 0.628737px -0.75px #00000042,
            1.21072px 1.21072px 1.71222px -1.5px #0000003f,
            2.6583px 2.6583px 3.75941px -2.25px #0000003b,
            5.90083px 5.90083px 8.34503px -3px #00000031,
            14px 14px 21.2132px -3.75px #00000033, -0.5px -0.5px #000000af;
        }

        .tactile-btn[data-color="secondary"]:active,
        .tactile-btn[data-color="secondary"][data-selected="true"] {
          box-shadow: inset 0.5px 0.5px 1px #ffffffb3,
            inset -0.5px -0.5px 1px #0000005b, 0.222px 0.222px 0.314px -1px #0003,
            0.605px 0.605px 0.856px -1px #0000002e,
            1.329px 1.329px 1.88px -1.5px #00000040,
            2.95px 2.95px 4.172px -2px #0000001a, 4px 4px 3px -2.5px #00000026,
            -0.5px -0.5px #000000ac;
        }

        /* Tertiary Color */
        .tactile-btn[data-color="tertiary"] {
          color: #fff;
          background: #6a6a6a;
          box-shadow: inset 1px 1px 1px #ffffffba, inset -1px -1px 1px #0000003b,
            0.444584px 0.444584px 0.628737px -1px #00000042,
            1.21072px 1.21072px 1.71222px -1.5px #0000003f,
            2.6583px 2.6583px 3.75941px -2.25px #0000003b,
            5.90083px 5.90083px 8.34503px -3px #0000004f,
            12px 12px 21.2132px -3.75px #0000001a, -0.5px -0.5px #0000006b;
        }

        .tactile-btn[data-color="tertiary"]:active,
        .tactile-btn[data-color="tertiary"][data-selected="true"] {
          box-shadow: inset 0.5px 0.5px 1px #ffffffba,
            inset -0.5px -0.5px 1px #0000005b, 0.222px 0.222px 0.314px -1px #0003,
            0.605px 0.605px 0.856px -1px #0000002e,
            1.329px 1.329px 1.88px -1.5px #00000040,
            2.95px 2.95px 4.172px -2px #0000001a, 4px 4px 3px -2.5px #00000026,
            -0.5px -0.5px #0000007b;
        }

        /* Neutral Color */
        .tactile-btn[data-color="neutral"] {
          color: #fff;
          background: #aaa;
          box-shadow: inset 1px 1px 1px #ffffffc2, inset -1px -1px 1px #0000003b,
            0.444584px 0.444584px 0.628737px -1px #00000042,
            1.21072px 1.21072px 1.71222px -1.5px #0000003f,
            2.6583px 2.6583px 3.75941px -2.25px #0000003b,
            5.90083px 5.90083px 8.34503px -3px #00000031,
            10px 10px 21.2132px -3.75px #0000000e, -0.5px -0.5px #00000012;
        }

        .tactile-btn[data-color="neutral"]:active,
        .tactile-btn[data-color="neutral"][data-selected="true"] {
          box-shadow: inset 0.5px 0.5px 1px #fff, inset -0.5px -0.5px 1px #0000005b,
            0.222px 0.222px 0.314px -1px #0003,
            0.605px 0.605px 0.856px -1px #0000002e,
            1.329px 1.329px 1.88px -1.5px #00000040,
            2.95px 2.95px 4.172px -2px #0000001a, 2.5px 2.5px 3px -2.5px #00000026,
            -0.5px -0.5px #00000022;
        }

        /* Block Mode */
        .tactile-btn[data-block="true"] {
          width: 100%;
          flex: 1;
        }

        /* Disabled State */
        .tactile-btn[data-disabled="true"] {
          opacity: 0.6;
          cursor: not-allowed;
          pointer-events: none;
        }

        /* Content Layout */
        .tactile-btn-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }

        /* LED Indicator */
        .led-indicator {
          display: block;
          width: 7px;
          height: 7px;
          border-radius: 100%;
          background-color: rgba(0, 0, 0, 0.1);
          box-shadow: inset 1px 1px 2px #0000001c, 0 1px 0 0px #ffffff30;
          transition: background-color 0.15s ease;
        }

        .tactile-btn[data-selected="true"] .led-indicator {
          background: #ff6b35;
        }
      `

export const ButtonLED = () => {
  return <span className="led-indicator" />
}
