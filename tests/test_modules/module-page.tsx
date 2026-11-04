import { Component, RenderBasic } from "@velotype/velotype/jsx-runtime"
import type { ChildrenAttr, EmptyAttrs, RenderableElements } from "@velotype/velotype/jsx-runtime"
import { Button, ColorScheme } from "@velotype/velodesign"

class NavSchemeSelector extends Component<EmptyAttrs> {
    darkMode = new RenderBasic<string>("--")
    override render() {
        if (ColorScheme.getColorScheme() == "light") {
            this.darkMode.value = "off"
        } else {
            this.darkMode.value = "on"
        }
        return <Button style={{marginBlock: "0.25rem"}} onClick={()=>{
            if (ColorScheme.getColorScheme() == "light") {
                ColorScheme.setColorScheme("dark")
                this.darkMode.value = "on"
            } else {
                ColorScheme.setColorScheme("light")
                this.darkMode.value = "off"
            }
        }}>Dark mode:{this.darkMode}</Button>
    }
}

export class TestModulePage extends Component<ChildrenAttr> {
    override render(_attrs: EmptyAttrs, children: RenderableElements[]) {
        return <div>
            <div><NavSchemeSelector/></div>
            <div>{children}</div>
        </div>
    }
}
